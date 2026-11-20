import type { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { decryptJson } from "@/lib/crypto";
import { fail, json } from "@/lib/http";
import { verifyWebhookSignature } from "@/lib/providers/razorpay";
import { markOrderFailed, markOrderPaid } from "@/lib/payments";

/** Razorpay webhook: payment.captured / order.paid / payment.failed. Source of truth if the browser closes mid-checkout. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const raw = await req.text();
  const db = createAdminClient();
  const { data: integ } = await db.from("integrations").select("secrets_encrypted").eq("organization_id", orgId).eq("provider", "razorpay").maybeSingle();
  const secret = decryptJson<{ webhook_secret?: string }>(integ?.secrets_encrypted)?.webhook_secret;
  const sig = req.headers.get("x-razorpay-signature") || "";
  if (!secret || !verifyWebhookSignature(secret, raw, sig)) return fail("invalid signature", 401);

  const evt = JSON.parse(raw);
  const { data: logged } = await db.from("webhook_events").insert({
    organization_id: orgId, provider: "razorpay", event_type: evt.event, external_id: req.headers.get("x-razorpay-event-id"), payload: evt,
  }).select("id").single();

  try {
    const payment = evt.payload?.payment?.entity;
    const orderId = payment?.order_id || evt.payload?.order?.entity?.id;
    if (orderId && (evt.event === "payment.captured" || evt.event === "order.paid")) {
      const { data: order } = await db.from("orders").select("id").eq("provider_order_id", orderId).eq("organization_id", orgId).maybeSingle();
      if (order) await markOrderPaid(db, order.id, {
        provider_payment_id: payment?.id || `order:${orderId}`, status: payment?.status || "captured", verified_via: "webhook",
        amount_minor: payment?.amount, currency: payment?.currency, method: payment?.method, raw: payment,
      });
    } else if (orderId && evt.event === "payment.failed") {
      await markOrderFailed(db, orderId);
    }
    await db.from("webhook_events").update({ processed: true }).eq("id", logged?.id);
  } catch (e: any) {
    await db.from("webhook_events").update({ error: e?.message }).eq("id", logged?.id);
  }
  return json({ ok: true });
}
