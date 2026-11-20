import { after, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { decryptJson } from "@/lib/crypto";
import { clientIp, fail, json, rateLimit } from "@/lib/http";
import { razorpayCreateOrder } from "@/lib/providers/razorpay";
import { createRegistration, onParticipantConfirmed, registrationSchema, RegistrationError } from "@/lib/registration";
import { pushCrmEvent } from "@/lib/providers/crm";
import { detectSource } from "@/lib/utils";

/** Public: register for a webinar. No attendee account needed. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!rateLimit(`reg:${clientIp(req)}`, 10, 60_000)) return fail("Too many attempts. Please wait a minute.", 429);
  const parsed = registrationSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return fail(parsed.error.issues[0]?.message || "Invalid registration");
  const input = parsed.data;
  const a = input.attribution || {};
  input.attribution = { ...a, source: detectSource(a as any, a.referrer) };

  const db = createAdminClient();
  try {
    const { webinar, participant, ticket, isPaid, duplicate } = await createRegistration(db, id, input);

    if (isPaid && participant.status === "pending_payment") {
      const { data: integ } = await db.from("integrations").select("config, secrets_encrypted, enabled").eq("organization_id", webinar.organization_id).eq("provider", "razorpay").maybeSingle();
      const secrets = decryptJson<{ key_secret: string }>(integ?.secrets_encrypted);
      const keyId = (integ?.config as any)?.key_id;
      if (!integ?.enabled || !secrets?.key_secret || !keyId) return fail("Payments are not set up for this webinar yet.", 503);
      const order = await razorpayCreateOrder({ key_id: keyId, key_secret: secrets.key_secret }, {
        amount: ticket.price_minor, currency: ticket.currency, receipt: participant.participant_code,
        notes: { participant_code: participant.participant_code, webinar_id: webinar.id, org_id: webinar.organization_id },
      });
      await db.from("orders").insert({
        organization_id: webinar.organization_id, webinar_id: webinar.id, participant_id: participant.id, ticket_id: ticket.id,
        amount_minor: ticket.price_minor, currency: ticket.currency, provider_order_id: order.id,
      });
      return json({ participant_code: participant.participant_code, status: "pending_payment", payment: { key_id: keyId, order_id: order.id, amount: order.amount, currency: order.currency } });
    }

    if (!duplicate) {
      if (participant.status === "confirmed") after(() => onParticipantConfirmed(db, participant.id));
      else after(() => pushCrmEvent(webinar.organization_id, "participant.registered", { participant_id: participant.participant_code, email: participant.email, status: participant.status, webinar_id: webinar.id }));
    }
    return json({ participant_code: participant.participant_code, status: participant.status, duplicate });
  } catch (e: any) {
    if (e instanceof RegistrationError) return fail(e.message, e.status);
    console.error("register error", e);
    return fail("Something went wrong. Please try again.", 500);
  }
}
