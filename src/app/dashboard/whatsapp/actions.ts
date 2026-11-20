"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin, getOrgContext } from "@/lib/org";
import { createClient } from "@/lib/supabase/server";
import { encrypt } from "@/lib/crypto";
import { getWatiConfig } from "@/lib/messaging";
import { watiListTemplates, watiSendTemplate } from "@/lib/providers/wati";
import { normalizePhone } from "@/lib/utils";

const s = (f: FormData, k: string) => { const v = f.get(k); return v === null ? null : String(v).trim() || null; };
const back = (msg: string, kind: "ok" | "error" = "ok") => redirect(`/dashboard/whatsapp?${kind}=${encodeURIComponent(msg)}`);

export async function connectWati(formData: FormData) {
  let ctx;
  try { ctx = await requireAdmin(); } catch (e: any) { return back(e.message, "error"); }
  const supabase = await createClient();
  // Accept the endpoint exactly as WATI shows it, e.g. https://live-mt-server.wati.io/10152083
  const rawUrl = (s(formData, "api_base_url") || "https://live-mt-server.wati.io").replace(/\/+$/, "");
  let baseUrl = rawUrl, tenantFromUrl: string | null = null;
  try {
    const u = new URL(rawUrl);
    const seg = u.pathname.split("/").filter(Boolean)[0];
    if (seg && /^\d+$/.test(seg)) tenantFromUrl = seg;
    baseUrl = u.origin;
  } catch { return back("API endpoint must be a full URL, e.g. https://live-mt-server.wati.io/10152083", "error"); }
  const token = s(formData, "access_token")?.replace(/^Bearer\s+/i, "") || null;
  const channel = normalizePhone(s(formData, "channel_number"));
  const tenantId = s(formData, "tenant_id") || tenantFromUrl;
  if (!channel) return back("Enter the WhatsApp number with country code, e.g. 919876543210", "error");

  const { data: existing } = await supabase.from("wati_connections").select("id").eq("organization_id", ctx.org.id).maybeSingle();
  if (!token && !existing) return back("Paste your WATI API token", "error");

  // verify credentials before saving
  if (token) {
    try { await watiListTemplates({ baseUrl, token, channelNumber: channel, tenantId }); }
    catch (e: any) { return back(`WATI rejected the credentials: ${e.message}`, "error"); }
  }
  const row: Record<string, unknown> = {
    organization_id: ctx.org.id, api_base_url: baseUrl, tenant_id: tenantId, channel_number: channel,
    status: "connected", last_verified_at: new Date().toISOString(),
    ...(token ? { access_token_encrypted: encrypt(token) } : {}),
  };
  const { error } = existing
    ? await supabase.from("wati_connections").update(row).eq("id", existing.id)
    : await supabase.from("wati_connections").insert(row);
  if (error) return back(error.message, "error");
  revalidatePath("/dashboard/whatsapp");
  back("WATI connected. Now add the webhook URL in WATI and map your templates.");
}

export async function disconnectWati() {
  let ctx;
  try { ctx = await requireAdmin(); } catch (e: any) { return back(e.message, "error"); }
  const supabase = await createClient();
  await supabase.from("wati_connections").delete().eq("organization_id", ctx.org.id);
  revalidatePath("/dashboard/whatsapp");
  back("WATI disconnected");
}

export async function saveWhatsappTemplate(formData: FormData) {
  const ctx = await getOrgContext();
  const supabase = await createClient();
  const watiName = s(formData, "wati_template_name")!;
  const params = (s(formData, "params") || "").split(",").map((x) => x.trim()).filter(Boolean);
  const mapping = params.map((p) => ({ param: p, variable: s(formData, `map_${p}`) || "name", static: s(formData, `static_${p}`) || undefined }));
  const row = { organization_id: ctx.org.id, channel: "whatsapp", name: s(formData, "name") || watiName, wati_template_name: watiName, body: s(formData, "body"), variable_mapping: mapping };
  const id = s(formData, "id");
  const { error } = id ? await supabase.from("message_templates").update(row).eq("id", id) : await supabase.from("message_templates").insert(row);
  if (error) return back(error.message, "error");
  revalidatePath("/dashboard/whatsapp");
  back(`Template "${row.name}" saved. Select it in each webinar's Automations tab.`);
}

export async function sendWatiTest(formData: FormData) {
  const ctx = await getOrgContext();
  const supabase = await createClient();
  const cfg = await getWatiConfig(supabase, ctx.org.id);
  if (!cfg) return back("Connect WATI first", "error");
  const to = normalizePhone(s(formData, "to"));
  if (!to) return back("Enter a valid test number with country code", "error");
  const { data: t } = await supabase.from("message_templates").select("*").eq("id", s(formData, "template_id")!).single();
  if (!t) return back("Pick a template", "error");
  const sample: Record<string, string> = { name: "Test User", first_name: "Test", webinar_title: "Sample Webinar", date: "Mon, 1 Dec 2026", time: "7:00 PM IST", join_link: "https://example.com/j/test", participant_id: "EVT-TEST123" };
  const parameters = (t.variable_mapping || []).map((m: any) => ({ name: m.param, value: m.variable === "static" ? m.static || "" : sample[m.variable] || m.variable }));
  const r = await watiSendTemplate(cfg, { to, templateName: t.wati_template_name, broadcastName: "eventos_test", parameters });
  back(r.ok ? `Accepted by WATI (id ${r.localMessageId || "n/a"}). Delivery status arrives via webhook.` : `WATI error: ${r.error}`, r.ok ? "ok" : "error");
}
