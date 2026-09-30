import { createHmac, timingSafeEqual } from "node:crypto";

export const TRAX_WEBHOOK_KINDS = [
  "status",
  "payment-status",
  "initial-charges",
  "final-charges",
] as const;

export type TraxWebhookKind = (typeof TRAX_WEBHOOK_KINDS)[number];

function sessionSecret() {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("SESSION_SECRET must be configured with at least 32 characters for TRAX webhooks");
  }
  return secret;
}

export function createTraxWebhookToken(brandId: string, kind: TraxWebhookKind) {
  return createHmac("sha256", sessionSecret())
    .update(`trax-webhook-v1\0${brandId}\0${kind}`)
    .digest("base64url");
}

export function isValidTraxWebhookToken(
  brandId: string,
  kind: TraxWebhookKind,
  suppliedToken: string,
) {
  let expected: Buffer;
  try {
    expected = Buffer.from(createTraxWebhookToken(brandId, kind), "utf8");
  } catch {
    return false;
  }
  const supplied = Buffer.from(suppliedToken, "utf8");
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

export function isTraxWebhookKind(value: string): value is TraxWebhookKind {
  return (TRAX_WEBHOOK_KINDS as readonly string[]).includes(value);
}