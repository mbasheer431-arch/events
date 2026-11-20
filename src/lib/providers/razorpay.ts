import "server-only";
import { hmacSha256Hex, safeEqual } from "@/lib/crypto";

export type RazorpayKeys = { key_id: string; key_secret: string; webhook_secret?: string };

export async function razorpayCreateOrder(keys: RazorpayKeys, input: {
  amount: number; currency: string; receipt: string; notes: Record<string, string>;
}) {
  const res = await fetch("https://api.razorpay.com/v1/orders", {
    method: "POST",
    headers: {
      Authorization: "Basic " + Buffer.from(`${keys.key_id}:${keys.key_secret}`).toString("base64"),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });
  const json: any = await res.json();
  if (!res.ok) throw new Error(json?.error?.description || "Could not create Razorpay order");
  return json as { id: string; amount: number; currency: string };
}

/** Checkout success handler signature: HMAC_SHA256(order_id|payment_id, key_secret) */
export function verifyCheckoutSignature(keySecret: string, orderId: string, paymentId: string, signature: string) {
  return safeEqual(hmacSha256Hex(keySecret, `${orderId}|${paymentId}`), signature);
}

/** Webhook: HMAC_SHA256(raw body, webhook_secret) in X-Razorpay-Signature */
export function verifyWebhookSignature(webhookSecret: string, rawBody: string, signature: string) {
  return safeEqual(hmacSha256Hex(webhookSecret, rawBody), signature);
}
