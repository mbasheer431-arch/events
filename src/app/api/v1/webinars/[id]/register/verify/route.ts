import type { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { decryptJson } from "@/lib/crypto";
import { fail, json } from "@/lib/http";
import { verifyCheckoutSignature } from "@/lib/providers/razorpay";
import { markOrderPaid } from "@/lib/payments";

/** Public: Razorpay checkout success handler — verifies the signature before confirming. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const b = await req.json().catch(() => ({}));
  const { participant_code, razorpay_order_id, razorpay_payment_id, razorpay_signature } = b;
  if (!participant_code || !razorpay_order_id || !razorpay_payment_id || !razorpay_signature) return fail("Missing payment details");
  const db = createAdminClient();
  const { data: order } = await db.from("orders").select("id, organization_id, participant_id, status, participants!inner(participant_code, webinar_id)")
    .eq("provider_order_id", razorpay_order_id).maybeSingle();
  const p = order?.participants as any;
  if (!order || p?.participant_code !== participant_code || p?.webinar_id !== id) return fail("Order not found", 404);
  if (order.status === "paid") return json({ ok: true });

  const { data: integ } = await db.from("integrations").select("secrets_encrypted").eq("organization_id", order.organization_id).eq("provider", "razorpay").maybeSingle();
  const secret = decryptJson<{ key_secret: string }>(integ?.secrets_encrypted)?.key_secret;
  if (!secret || !verifyCheckoutSignature(secret, razorpay_order_id, razorpay_payment_id, razorpay_signature)) return fail("Payment signature is invalid", 400);

  await markOrderPaid(db, order.id, { provider_payment_id: razorpay_payment_id, status: "captured", verified_via: "checkout_signature" });
  return json({ ok: true });
}
