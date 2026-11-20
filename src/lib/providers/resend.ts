import "server-only";

export async function sendEmail(input: {
  to: string; subject: string; html: string; text?: string; fromName?: string | null; replyTo?: string | null;
}): Promise<{ ok: true; id: string | null } | { ok: false; error: string }> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!key || !from) return { ok: false, error: "Email not configured (RESEND_API_KEY / EMAIL_FROM)" };
  // Allow per-org display name while keeping the verified sending address
  const address = from.match(/<(.+)>/)?.[1] || from;
  const sender = input.fromName ? `${input.fromName.replace(/[<>"]/g, "")} <${address}>` : from;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: sender, to: [input.to], subject: input.subject, html: input.html, text: input.text,
        ...(input.replyTo ? { reply_to: input.replyTo } : {}),
      }),
    });
    const json: any = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: json?.message || `HTTP ${res.status}` };
    return { ok: true, id: json?.id || null };
  } catch (e: any) {
    return { ok: false, error: e?.message || "Email request failed" };
  }
}
