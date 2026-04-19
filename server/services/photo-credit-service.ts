/**
 * photo-credit-service — org-scoped credit wallet backed by photo_credit_ledger.
 *
 * Design principles
 *  - **Append-only ledger.** Balance is derived from sum(delta) per org — we
 *    never mutate rows. Every state change is auditable: grant, purchase,
 *    download, refund, adjustment. `balanceAfter` is stored for fast reads
 *    and serves as an integrity check (sum should match the latest row).
 *  - **Debits are transactional.** The debit path (`chargeForDownload`) takes
 *    a DB transaction, locks the latest ledger row for the org, verifies
 *    sufficient balance, and writes the new row atomically. Two concurrent
 *    downloads can't both pass the balance check and overdraw.
 *  - **Org-scoped, not user-scoped.** Per PRD: credits belong to the
 *    organization. Every query keys on orgId. userId is captured only as an
 *    audit trail (who triggered the debit).
 *  - **Stripe-agnostic core.** The ledger knows nothing about Stripe price
 *    IDs or checkout sessions — it just records deltas. Stripe concerns
 *    (Checkout session creation, webhook payload parsing) live in the
 *    methods that bridge Stripe → ledger.
 *
 * Why not extend subscription-service? That service models per-user recurring
 * plans for the ad-generator. Photo credits are org-scoped, one-time
 * Checkout purchases, with a durable ledger rather than a user-row counter.
 * Different domain, different failure modes — deliberately separate.
 */

import Stripe from "stripe";
import { desc, eq } from "drizzle-orm";
import { db } from "../db";
import { ENV } from "../config/environment";
import {
  photoCreditLedger,
  type PhotoCreditLedgerEntry,
} from "@shared/schema";

const stripe = new Stripe(ENV.stripe.secretKey, {
  apiVersion: "2025-08-27.basil",
});

// ─────────────────────────────────────────────────────────────────────────────
// Credit pack catalog
// ─────────────────────────────────────────────────────────────────────────────
//
// Three tiers per PRD §10 + the AutoHDR benchmark ($0.45–$0.60/image). Pricing
// numbers here are DISPLAY-ONLY — Stripe is the source of truth for what the
// customer actually gets charged. The `credits` field is what we grant when
// Stripe confirms the payment. Bumping this without bumping the Stripe price
// breaks the value prop — they must be changed together.
//
// Keep these in sync with the SKUs in Stripe Dashboard. The map-by-priceId
// lookup in `resolvePackByPriceId` is the guard: an unknown priceId aborts
// the grant so we never credit for a SKU we don't recognise.

export interface PhotoCreditPack {
  id: "starter" | "growth" | "agency";
  name: string;
  credits: number;
  displayPriceUsd: number; // for UI only — Stripe has final word
  priceId: string;         // Stripe Price ID (test or live, via env)
  description: string;
}

/**
 * Return the pack catalog. Called per-request because ENV.stripe.*PriceId
 * is resolved lazily via env (test vs live). Not cached so a dev restart
 * picks up new envs without a code change.
 */
export function getPhotoCreditPacks(): PhotoCreditPack[] {
  return [
    {
      id: "starter",
      name: "Starter",
      credits: 100,
      displayPriceUsd: 49,
      priceId: ENV.stripe.photoStarterPackPriceId,
      description: "100 photo credits — good for ~5 listings",
    },
    {
      id: "growth",
      name: "Growth",
      credits: 500,
      displayPriceUsd: 199,
      priceId: ENV.stripe.photoGrowthPackPriceId,
      description: "500 photo credits — best value for active agents",
    },
    {
      id: "agency",
      name: "Agency",
      credits: 2000,
      displayPriceUsd: 699,
      priceId: ENV.stripe.photoAgencyPackPriceId,
      description: "2,000 photo credits — volume pricing for brokerages",
    },
  ];
}

function resolvePackByPriceId(priceId: string): PhotoCreditPack | null {
  return getPhotoCreditPacks().find((p) => p.priceId && p.priceId === priceId) ?? null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Errors
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Thrown when a debit can't proceed because the org doesn't have enough
 * credits. Callers (download endpoint) should catch this and respond 402
 * Payment Required so the UI can prompt the user to top up.
 */
export class InsufficientCreditsError extends Error {
  statusCode = 402;
  constructor(public orgId: string, public required: number, public available: number) {
    super(`Insufficient credits: required ${required}, available ${available}`);
    this.name = "InsufficientCreditsError";
  }
}

export class PackNotConfiguredError extends Error {
  statusCode = 503;
  constructor(public packId: string) {
    super(`Photo credit pack '${packId}' is not configured — set its Stripe price ID env var`);
    this.name = "PackNotConfiguredError";
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Service
// ─────────────────────────────────────────────────────────────────────────────

export class PhotoCreditService {
  /**
   * Read the org's current credit balance. Pulls the most recent ledger row
   * and returns its balanceAfter — O(1) in practice (index on orgId+createdAt).
   * Returns 0 when the org has no ledger entries yet.
   */
  async getBalance(orgId: string): Promise<number> {
    const [latest] = await db
      .select({ balanceAfter: photoCreditLedger.balanceAfter })
      .from(photoCreditLedger)
      .where(eq(photoCreditLedger.orgId, orgId))
      .orderBy(desc(photoCreditLedger.createdAt), desc(photoCreditLedger.id))
      .limit(1);

    return latest?.balanceAfter ?? 0;
  }

  /**
   * Record a grant (free credits given by ops, e.g. welcome bonus or
   * comp for a support escalation). Idempotent on (orgId, refId) only if the
   * caller passes a refId — otherwise dupes are possible, which is fine for
   * manual grants.
   */
  async recordGrant(input: {
    orgId: string;
    userId?: string;
    amount: number;
    reason?: string;
    refId?: string;
  }): Promise<PhotoCreditLedgerEntry> {
    if (input.amount <= 0) {
      throw new Error("Grant amount must be positive");
    }
    return this.appendLedgerRow({
      orgId: input.orgId,
      userId: input.userId ?? null,
      delta: input.amount,
      reason: input.reason ?? "grant",
      refType: "manual_grant",
      refId: input.refId ?? null,
      stripeChargeId: null,
    });
  }

  /**
   * Record a purchase. Called by the Stripe webhook once the Checkout session
   * completes. Idempotency is enforced by checking for an existing ledger row
   * with the same stripeChargeId — a retry of the same webhook will no-op
   * instead of double-granting.
   */
  async recordPurchase(input: {
    orgId: string;
    userId?: string | null;
    credits: number;
    stripeChargeId: string;
    stripeSessionId: string;
    packId: string;
  }): Promise<PhotoCreditLedgerEntry> {
    if (input.credits <= 0) {
      throw new Error("Purchase credits must be positive");
    }

    // Idempotency guard: if this charge was already credited, return the
    // existing row. Stripe can redeliver the same webhook — we must not
    // grant twice.
    const [existing] = await db
      .select()
      .from(photoCreditLedger)
      .where(eq(photoCreditLedger.stripeChargeId, input.stripeChargeId))
      .limit(1);

    if (existing) {
      return existing;
    }

    return this.appendLedgerRow({
      orgId: input.orgId,
      userId: input.userId ?? null,
      delta: input.credits,
      reason: "purchase",
      refType: "stripe_checkout",
      refId: input.stripeSessionId,
      stripeChargeId: input.stripeChargeId,
    });
  }

  /**
   * Debit for a download. Runs inside a transaction so concurrent downloads
   * can't both pass the balance check. Throws InsufficientCreditsError on
   * overdraft — callers should respond 402.
   *
   * `amount` is positive; we write it as a negative delta internally.
   */
  async chargeForDownload(input: {
    orgId: string;
    userId: string;
    amount: number;
    refId: string; // photo_download row id (stringified) or version id
  }): Promise<PhotoCreditLedgerEntry> {
    if (input.amount <= 0) {
      throw new Error("Debit amount must be positive");
    }

    return db.transaction(async (tx) => {
      // Lock the most recent row for this org so a concurrent debit waits.
      // SELECT ... FOR UPDATE on a single-row read is the standard pattern.
      const [latest] = await tx
        .select({ balanceAfter: photoCreditLedger.balanceAfter })
        .from(photoCreditLedger)
        .where(eq(photoCreditLedger.orgId, input.orgId))
        .orderBy(desc(photoCreditLedger.createdAt), desc(photoCreditLedger.id))
        .limit(1)
        .for("update");

      const currentBalance = latest?.balanceAfter ?? 0;
      if (currentBalance < input.amount) {
        throw new InsufficientCreditsError(input.orgId, input.amount, currentBalance);
      }

      const newBalance = currentBalance - input.amount;
      const [row] = await tx
        .insert(photoCreditLedger)
        .values({
          orgId: input.orgId,
          userId: input.userId,
          delta: -input.amount,
          balanceAfter: newBalance,
          reason: "download",
          refType: "photo_download",
          refId: input.refId,
          stripeChargeId: null,
        })
        .returning();

      return row;
    });
  }

  /**
   * Refund previously-debited credits. Used when a download fails after
   * debit (rare — we debit post-auth and pre-serve) or an ops correction.
   */
  async recordRefund(input: {
    orgId: string;
    userId?: string | null;
    amount: number;
    reason?: string;
    refId?: string;
  }): Promise<PhotoCreditLedgerEntry> {
    if (input.amount <= 0) {
      throw new Error("Refund amount must be positive");
    }
    return this.appendLedgerRow({
      orgId: input.orgId,
      userId: input.userId ?? null,
      delta: input.amount,
      reason: input.reason ?? "refund",
      refType: "manual_refund",
      refId: input.refId ?? null,
      stripeChargeId: null,
    });
  }

  // ───────────────────────────────────────────────────────────────────────
  // Stripe Checkout bridge
  // ───────────────────────────────────────────────────────────────────────

  /**
   * Create a Stripe Checkout session for a credit pack. Returns the session
   * URL the client should redirect to. Metadata embeds orgId + userId +
   * packId so the webhook has everything it needs to grant correctly
   * without another DB lookup by email/customer.
   */
  async createCheckoutSession(input: {
    orgId: string;
    userId: string;
    userEmail: string;
    packId: PhotoCreditPack["id"];
    successUrl: string;
    cancelUrl: string;
  }): Promise<{ sessionId: string; url: string }> {
    const pack = getPhotoCreditPacks().find((p) => p.id === input.packId);
    if (!pack) {
      throw new Error(`Unknown pack id: ${input.packId}`);
    }
    if (!pack.priceId) {
      throw new PackNotConfiguredError(input.packId);
    }

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [
        {
          price: pack.priceId,
          quantity: 1,
        },
      ],
      customer_email: input.userEmail,
      // Metadata carries org + user + pack through to the webhook. We use
      // metadata (not client_reference_id) so we can pass multiple fields.
      metadata: {
        orgId: input.orgId,
        userId: input.userId,
        packId: pack.id,
        credits: String(pack.credits),
        source: "photo_credit_pack",
      },
      // payment_intent metadata is duplicated so we can find the intent
      // from a charge webhook even if Stripe drops the session context.
      payment_intent_data: {
        metadata: {
          orgId: input.orgId,
          userId: input.userId,
          packId: pack.id,
          credits: String(pack.credits),
          source: "photo_credit_pack",
        },
      },
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
    });

    if (!session.url) {
      throw new Error("Stripe did not return a checkout session URL");
    }

    return { sessionId: session.id, url: session.url };
  }

  /**
   * Handle a Stripe webhook event for the photo module. Returns `true` if
   * the event was recognised as photo-related (and handled), `false`
   * otherwise so the caller can forward it to other handlers.
   *
   * Events we care about:
   *   - `checkout.session.completed` (mode=payment, metadata.source=photo_credit_pack)
   */
  async handleWebhookEvent(event: Stripe.Event): Promise<boolean> {
    if (event.type !== "checkout.session.completed") {
      return false;
    }

    const session = event.data.object as Stripe.Checkout.Session;

    // Only act on payment-mode sessions flagged as photo credit packs.
    // Subscription-mode sessions (from the ad-generator) flow through
    // subscription-service and must not be touched here.
    if (session.mode !== "payment") return false;
    if (session.metadata?.source !== "photo_credit_pack") return false;

    if (session.payment_status !== "paid") {
      console.warn(
        `PHOTO_CREDITS: skipping session ${session.id} — payment_status=${session.payment_status}`
      );
      return true; // recognised but not actionable yet
    }

    const orgId = session.metadata.orgId;
    const userId = session.metadata.userId;
    const packId = session.metadata.packId;
    if (!orgId || !packId) {
      console.error(
        `PHOTO_CREDITS: session ${session.id} missing metadata — cannot credit`
      );
      return true;
    }

    // Trust the priceId on the session, not the metadata.credits value.
    // metadata is user-controlled (via our own code), but the priceId is
    // Stripe-authoritative — if someone tampered with metadata we'd catch it.
    const lineItems = await stripe.checkout.sessions.listLineItems(session.id, {
      limit: 5,
    });
    const lineItem = lineItems.data[0];
    const priceId = lineItem?.price?.id ?? "";
    const pack = resolvePackByPriceId(priceId);

    if (!pack) {
      console.error(
        `PHOTO_CREDITS: session ${session.id} priceId=${priceId} not in catalog — skipping`
      );
      return true;
    }

    const chargeId =
      typeof session.payment_intent === "string"
        ? session.payment_intent
        : session.payment_intent?.id;

    if (!chargeId) {
      console.error(`PHOTO_CREDITS: session ${session.id} has no payment_intent`);
      return true;
    }

    const row = await this.recordPurchase({
      orgId,
      userId,
      credits: pack.credits,
      stripeChargeId: chargeId,
      stripeSessionId: session.id,
      packId: pack.id,
    });

    console.log(
      `💳 PHOTO_CREDITS: granted ${pack.credits} to org=${orgId} (session=${session.id}, ledger=${row.id}, balanceAfter=${row.balanceAfter})`
    );
    return true;
  }

  /**
   * Recent ledger entries for an org, newest first. Used by the UI
   * transactions panel and by ops when investigating balance disputes.
   */
  async listRecent(orgId: string, limit = 50): Promise<PhotoCreditLedgerEntry[]> {
    return db
      .select()
      .from(photoCreditLedger)
      .where(eq(photoCreditLedger.orgId, orgId))
      .orderBy(desc(photoCreditLedger.createdAt), desc(photoCreditLedger.id))
      .limit(limit);
  }

  // ───────────────────────────────────────────────────────────────────────
  // Internals
  // ───────────────────────────────────────────────────────────────────────

  /**
   * Append a non-debit ledger row. Debits MUST go through
   * `chargeForDownload` so the locking semantics are right. This helper is
   * for grants/purchases/refunds where concurrency doesn't matter (delta
   * is always additive to balance).
   */
  private async appendLedgerRow(input: {
    orgId: string;
    userId: string | null;
    delta: number;
    reason: string;
    refType: string | null;
    refId: string | null;
    stripeChargeId: string | null;
  }): Promise<PhotoCreditLedgerEntry> {
    return db.transaction(async (tx) => {
      const [latest] = await tx
        .select({ balanceAfter: photoCreditLedger.balanceAfter })
        .from(photoCreditLedger)
        .where(eq(photoCreditLedger.orgId, input.orgId))
        .orderBy(desc(photoCreditLedger.createdAt), desc(photoCreditLedger.id))
        .limit(1)
        .for("update");

      const currentBalance = latest?.balanceAfter ?? 0;
      const newBalance = currentBalance + input.delta;

      const [row] = await tx
        .insert(photoCreditLedger)
        .values({
          orgId: input.orgId,
          userId: input.userId,
          delta: input.delta,
          balanceAfter: newBalance,
          reason: input.reason,
          refType: input.refType,
          refId: input.refId,
          stripeChargeId: input.stripeChargeId,
        })
        .returning();
      return row;
    });
  }
}

export const photoCreditService = new PhotoCreditService();
