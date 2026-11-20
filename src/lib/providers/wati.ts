import "server-only";

/**
 * WATI client. Uses API v3 (recommended for new integrations):
 *   POST {base}/api/ext/v3/messageTemplates/send
 *   GET  {base}/api/ext/v3/messageTemplates
 * Falls back to the legacy v2 template list when a tenant ID is configured.
 * A 200 response only means "accepted" — delivery comes later through webhooks.
 */
export type WatiConfig = { baseUrl: string; token: string; channelNumber: string; tenantId?: string | null };

export type WatiTemplate = { name: string; status: string; language?: string; body: string; params: string[] };

function headers(token: string) {
  const t = token.replace(/^Bearer\s+/i, "");
  return { Authorization: `Bearer ${t}`, "Content-Type": "application/json", Accept: "application/json" };
}

function extractParams(body: string): string[] {
  const set = new Set<string>();
  for (const m of body.matchAll(/\{\{\s*([\w.-]+)\s*\}\}/g)) set.add(m[1]);
  return [...set];
}

function normaliseTemplates(json: any): WatiTemplate[] {
  const arr: any[] = json?.message_templates || json?.messageTemplates || json?.templates || json?.data?.items || json?.data || json?.items || [];
  if (!Array.isArray(arr)) return [];
  return arr.map((t) => {
    const body = t.body || t.bodyOriginal || t.body_original || t.components?.find?.((c: any) => /body/i.test(c.type))?.text || "";
    const declared: string[] = (t.customParams || t.custom_params || t.parameters || []).map((p: any) => p.paramName || p.name).filter(Boolean);
    return {
      name: t.elementName || t.element_name || t.name,
      status: String(t.status || t.template_status || "").toUpperCase(),
      language: t.language?.value || t.language?.key || t.language,
      body,
      params: declared.length ? declared : extractParams(body),
    };
  }).filter((t) => t.name);
}

export async function watiListTemplates(cfg: WatiConfig): Promise<WatiTemplate[]> {
  const base = cfg.baseUrl.replace(/\/$/, "");
  const v3 = await fetch(`${base}/api/ext/v3/messageTemplates?page_number=1&page_size=200`, { headers: headers(cfg.token), cache: "no-store" });
  if (v3.ok) return normaliseTemplates(await v3.json());
  if (cfg.tenantId) {
    for (const v of ["v2", "v1"]) {
      const r = await fetch(`${base}/${cfg.tenantId}/api/${v}/getMessageTemplates?pageSize=200&pageNumber=1`, { headers: headers(cfg.token), cache: "no-store" });
      if (r.ok) return normaliseTemplates(await r.json());
    }
    const v2 = { status: v3.status };
    throw new Error(`WATI templates request failed (${v2.status})`);
  }
  throw new Error(`WATI templates request failed (${v3.status}). Check the API token scope and base URL.`);
}

export async function watiSendTemplate(
  cfg: WatiConfig,
  input: { to: string; templateName: string; broadcastName: string; parameters: { name: string; value: string }[] },
): Promise<{ ok: true; localMessageId: string | null } | { ok: false; error: string }> {
  const base = cfg.baseUrl.replace(/\/$/, "");
  try {
    const res = await fetch(`${base}/api/ext/v3/messageTemplates/send`, {
      method: "POST",
      headers: headers(cfg.token),
      body: JSON.stringify({
        template_name: input.templateName,
        broadcast_name: input.broadcastName.slice(0, 60),
        channel_number: cfg.channelNumber,
        target: input.to,
        parameters: input.parameters,
      }),
    });
    // Fallback to the tenant-scoped v1 endpoint when the token isn't a v3 scoped token
    if ((res.status === 401 || res.status === 403 || res.status === 404) && cfg.tenantId) {
      return await watiSendTemplateV1(cfg, input);
    }
    const json: any = await res.json().catch(() => ({}));
    if (!res.ok || json?.result === false) {
      return { ok: false, error: json?.error?.message || json?.error || json?.info || `HTTP ${res.status}` };
    }
    const r = json?.receivers?.[0];
    if (r && r.isValidWhatsAppNumber === false) return { ok: false, error: "Not a valid WhatsApp number" };
    if (r?.errors?.length) return { ok: false, error: JSON.stringify(r.errors).slice(0, 300) };
    return { ok: true, localMessageId: r?.localMessageId || json?.localMessageId || null };
  } catch (e: any) {
    return { ok: false, error: e?.message || "WATI request failed" };
  }
}

async function watiSendTemplateV1(
  cfg: WatiConfig,
  input: { to: string; templateName: string; broadcastName: string; parameters: { name: string; value: string }[] },
): Promise<{ ok: true; localMessageId: string | null } | { ok: false; error: string }> {
  const base = cfg.baseUrl.replace(/\/$/, "");
  const res = await fetch(`${base}/${cfg.tenantId}/api/v1/sendTemplateMessage?whatsappNumber=${encodeURIComponent(input.to)}`, {
    method: "POST", headers: headers(cfg.token),
    body: JSON.stringify({ template_name: input.templateName, broadcast_name: input.broadcastName.slice(0, 60), parameters: input.parameters }),
  });
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok || json?.result === false) return { ok: false, error: json?.info || json?.message || `HTTP ${res.status}` };
  return { ok: true, localMessageId: json?.receivers?.[0]?.localMessageId || json?.localMessageId || json?.id || null };
}

/** Maps a WATI webhook eventType to our delivery status. */
export function watiEventToStatus(eventType: string): "sent" | "delivered" | "read" | "failed" | null {
  const e = eventType.toLowerCase();
  if (e.startsWith("templatemessagefailed")) return "failed";
  if (e.startsWith("sentmessageread") || e.startsWith("sentmessagereplied")) return "read";
  if (e.startsWith("sentmessagedelivered")) return "delivered";
  if (e.startsWith("templatemessagesent")) return "sent";
  return null;
}
