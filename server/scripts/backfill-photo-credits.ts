/**
 * One-off backfill for photo credit pack purchases whose webhooks never
 * landed successfully. Root cause: until the raw-body middleware was
 * added (see `server/index.ts`), every Stripe webhook failed signature
 * verification and the purchase was never credited to the org ledger.
 *
 * Usage
 * -----
 * From the project root:
 *
 *   npx tsx server/scripts/backfill-photo-credits.ts
 *
 * What it does
 *  - Lists recent completed Stripe Checkout sessions (default: last 100).
 *  - Filters to those flagged `metadata.source=photo_credit_pack` and
 *    `payment_status=paid`.
 *  - For each, synthesises a `checkout.session.completed` event and passes
 *    it through `photoCreditService.handleWebhookEvent`. The service is
 *    idempotent on `stripeChargeId` so re-running is a no-op for rows
 *    already credited.
 *
 * Why this is safe to re-run
 *  - Idempotency guard in `recordPurchase` short-circuits if the
 *    stripe_charge_id is already in the ledger.
 *  - No writes happen for sessions that don't match the photo-credit-pack
 *    metadata tag, so subscription purchases are untouched.
 *
 * Why it's a script, not a route
 *  - This is a one-off recovery. Exposing an admin endpoint would require
 *    auth plumbing we don't need permanently.
 */

import { config } from "dotenv";
config();

import Stripe from "stripe";
import { ENV } from "../config/environment";
import { photoCreditService } from "../services/photo-credit-service";

async function main() {
  const stripe = new Stripe(ENV.stripe.secretKey, {
    apiVersion: "2025-08-27.basil",
  });

  console.log("🔎 Fetching recent Checkout sessions from Stripe…");
  const sessions = await stripe.checkout.sessions.list({
    limit: 100,
    expand: ["data.payment_intent"],
  });

  const photoSessions = sessions.data.filter(
    (s) =>
      s.mode === "payment" &&
      s.metadata?.source === "photo_credit_pack" &&
      s.payment_status === "paid"
  );

  console.log(
    `📋 Found ${sessions.data.length} total recent sessions, ${photoSessions.length} are paid photo-credit-pack sessions`
  );

  if (photoSessions.length === 0) {
    console.log("✅ Nothing to backfill.");
    return;
  }

  let granted = 0;
  let skipped = 0;
  let errored = 0;

  for (const session of photoSessions) {
    try {
      // Synthesise the exact event shape our handler expects. We pass it
      // straight into the same webhook handler so there's no divergent
      // code path — the ledger insert goes through the same idempotency
      // guards as a real webhook.
      const event = {
        id: `evt_backfill_${session.id}`,
        object: "event",
        type: "checkout.session.completed",
        data: { object: session },
      } as unknown as Stripe.Event;

      const before = await photoCreditService.getBalance(
        session.metadata?.orgId ?? ""
      );
      const handled = await photoCreditService.handleWebhookEvent(event);
      const after = await photoCreditService.getBalance(
        session.metadata?.orgId ?? ""
      );

      if (!handled) {
        console.log(`⏭️  ${session.id} — not recognised as photo pack`);
        skipped++;
        continue;
      }

      if (before === after) {
        console.log(
          `↩️  ${session.id} — already credited (balance unchanged: ${after})`
        );
        skipped++;
      } else {
        console.log(
          `💳 ${session.id} — org=${session.metadata?.orgId} granted ${after - before} (balance ${before} → ${after})`
        );
        granted++;
      }
    } catch (err: any) {
      console.error(
        `❌ ${session.id} — error: ${err?.message ?? err}`
      );
      errored++;
    }
  }

  console.log(
    `\n✅ Done. granted=${granted}, skipped=${skipped}, errored=${errored}`
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Fatal:", err);
    process.exit(1);
  });
