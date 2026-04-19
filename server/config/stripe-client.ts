import Stripe from "stripe";
import { ENV } from "./environment";

let instance: Stripe | null = null;

const API_VERSION = "2025-08-27.basil" as const;

/** Lazily construct Stripe so the dev server can boot without STRIPE_* set. */
export function getStripe(): Stripe {
  const key = ENV.stripe.secretKey?.trim();
  if (!key) {
    throw new Error(
      "Stripe is not configured: set STRIPE_SECRET_KEY (local/test) or STRIPE_LIVE_SECRET_KEY (live app domain) in .env."
    );
  }
  if (!instance) {
    instance = new Stripe(key, { apiVersion: API_VERSION });
  }
  return instance;
}
