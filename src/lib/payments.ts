import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { confirmParticipant } from "@/lib/registration";

/** Idempotent: records the payment and confirms the participant exactly once. */
export async function markOrderPaid(db: SupabaseClient, orderId: string, pay: { provider_payment_id: string; status: string; verified_via: string; amount_minor?: number; currency?: string; method?: string; raw?: unknown }) {
  const { data: order } = await db.from("orders").update({ status: "paid" }).eq("id", orderId).neq("status", "paid").select("id, organization_id, participant_id, amount_minor, currency").maybeSingle();
  await db.from("payments").upsert({
    organization_id: order?.organization_id ?? (await db.from("orders").select("organization_id").eq("id", orderId).single()).data?.organization_id,
    order_id: orderId, provider_payment_id: pay.provider_payment_id, status: pay.status, verified_via: pay.verified_via,
    amount_minor: pay.amount_minor ?? order?.amount_minor, currency: pay.currency ?? order?.currency, method: pay.method, raw: pay.raw ?? null,
  }, { onConflict: "provider_payment_id", ignoreDuplicates: true });
  if (order) await confirmParticipant(db, order.participant_id, { payment_status: "paid" });
}

export async function markOrderFailed(db: SupabaseClient, providerOrderId: string) {
  const { data: order } = await db.from("orders").update({ status: "failed" }).eq("provider_order_id", providerOrderId).eq("status", "created").select("participant_id").maybeSingle();
  if (order) await db.from("participants").update({ payment_status: "failed" }).eq("id", order.participant_id).eq("status", "pending_payment");
}
