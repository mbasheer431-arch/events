import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { decryptJson, hmacSha256Hex } from "@/lib/crypto";

export type CrmEvent = "participant.registered" | "participant.confirmed" | "participant.attended" | "participant.absent";

/**
 * Integration-ready CRM sync: POSTs a signed JSON payload to the organisation's
 * webhook URL (n8n, Make, Zapier, LeadSquared/Salesforce middleware...).
 * Header X-EventOS-Signature = HMAC_SHA256(secret, body).
 */
export async function pushCrmEvent(orgId: string, event: CrmEvent, data: Record<string, unknown>) {
  const db = createAdminClient();
  const { data: integ } = await db.from("integrations").select("enabled, config, secrets_encrypted")
    .eq("organization_id", orgId).eq("provider", "crm_webhook").maybeSingle();
  if (!integ?.enabled) return;
  const cfg = integ.config as { url?: string; events?: string[] };
  if (!cfg.url || (cfg.events?.length && !cfg.events.includes(event))) return;
  const secret = decryptJson<{ signing_secret?: string }>(integ.secrets_encrypted)?.signing_secret || "";
  const body = JSON.stringify({ event, sent_at: new Date().toISOString(), data });
  try {
    await fetch(cfg.url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(secret ? { "X-EventOS-Signature": hmacSha256Hex(secret, body) } : {}) },
      body,
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    /* CRM outages must never break registration */
  }
}
