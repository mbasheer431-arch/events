"use server";
import crypto from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/org";
import { createClient } from "@/lib/supabase/server";
import { decryptJson, encryptJson } from "@/lib/crypto";
import { sendEmail } from "@/lib/providers/resend";
import { emailHtml } from "@/lib/templates";
import { APP_URL } from "@/lib/utils";

const s = (f: FormData, k: string) => { const v = f.get(k); return v === null ? null : String(v).trim() || null; };
const back = (path: string, msg: string, kind: "ok" | "error" = "ok") => redirect(`${path}?${kind}=${encodeURIComponent(msg)}`);
async function admin(path: string) { try { return await requireAdmin(); } catch (e: any) { return back(path, e.message, "error"); } }

export async function updateOrg(formData: FormData) {
  const ctx = await admin("/dashboard/settings");
  const supabase = await createClient();
  const { error } = await supabase.from("organizations").update({
    name: s(formData, "name") || ctx.org.name, timezone: s(formData, "timezone") || ctx.org.timezone, website: s(formData, "website"),
    logo_url: s(formData, "logo_url"), email_from_name: s(formData, "email_from_name"), email_reply_to: s(formData, "email_reply_to"),
  }).eq("id", ctx.org.id);
  if (error) return back("/dashboard/settings", error.message, "error");
  revalidatePath("/dashboard", "layout");
  back("/dashboard/settings", "Organization updated");
}

export async function inviteMember(formData: FormData) {
  const path = "/dashboard/settings/team";
  const ctx = await admin(path);
  const supabase = await createClient();
  const email = s(formData, "email")?.toLowerCase();
  if (!email) return back(path, "Enter an email", "error");
  const { data: inv, error } = await supabase.from("organization_invites")
    .insert({ organization_id: ctx.org.id, email, role: s(formData, "role") || "member", invited_by: ctx.user.id }).select("token").single();
  if (error || !inv) return back(path, error?.message || "Could not create invite", "error");
  const link = `${APP_URL}/invite/${inv.token}`;
  const r = await sendEmail({
    to: email, subject: `You're invited to ${ctx.org.name} on EventOS`,
    html: emailHtml(`${ctx.user.email} invited you to join ${ctx.org.name} on EventOS.\n\nThe invite expires in 7 days.`, { orgName: ctx.org.name, ctaUrl: link, ctaLabel: "Accept invitation" }),
  });
  revalidatePath(path);
  back(path, r.ok ? `Invite sent to ${email}` : `Invite created — email failed (${r.error}). Share this link: ${link}`, r.ok ? "ok" : "error");
}

export async function revokeInvite(formData: FormData) {
  const path = "/dashboard/settings/team";
  await admin(path);
  const supabase = await createClient();
  await supabase.from("organization_invites").delete().eq("id", s(formData, "id")!);
  revalidatePath(path);
}

export async function updateMember(formData: FormData) {
  const path = "/dashboard/settings/team";
  const ctx = await admin(path);
  const supabase = await createClient();
  const userId = s(formData, "user_id")!;
  if (userId === ctx.user.id) return back(path, "You can't change your own role", "error");
  const { data: target } = await supabase.from("organization_members").select("role").eq("organization_id", ctx.org.id).eq("user_id", userId).single();
  if (target?.role === "owner" && ctx.role !== "owner") return back(path, "Only owners can change another owner", "error");
  if (s(formData, "action") === "remove") await supabase.from("organization_members").delete().eq("organization_id", ctx.org.id).eq("user_id", userId);
  else await supabase.from("organization_members").update({ role: s(formData, "role") }).eq("organization_id", ctx.org.id).eq("user_id", userId);
  revalidatePath(path);
  back(path, "Team updated");
}

/** Saves Zoom / Razorpay / CRM webhook settings. Secrets are merged so blank fields keep the saved value. */
export async function saveIntegration(formData: FormData) {
  const path = "/dashboard/settings/integrations";
  const ctx = await admin(path);
  const supabase = await createClient();
  const provider = s(formData, "provider")!;
  const { data: existing } = await supabase.from("integrations").select("id, config, secrets_encrypted").eq("organization_id", ctx.org.id).eq("provider", provider).maybeSingle();
  const secrets: Record<string, string> = { ...(decryptJson(existing?.secrets_encrypted) || {}) };
  const config: Record<string, unknown> = { ...(existing?.config || {}) };

  if (provider === "zoom") {
    const t = s(formData, "secret_token"); if (t) secrets.secret_token = t;
    if (!secrets.secret_token) return back(path, "Paste the Zoom webhook Secret Token", "error");
  } else if (provider === "razorpay") {
    const id = s(formData, "key_id"), sec = s(formData, "key_secret"), wh = s(formData, "webhook_secret");
    if (id) config.key_id = id;
    if (sec) secrets.key_secret = sec;
    if (wh) secrets.webhook_secret = wh;
    if (!config.key_id || !secrets.key_secret) return back(path, "Razorpay Key ID and Key Secret are required", "error");
    config.mode = String(config.key_id).startsWith("rzp_live") ? "live" : "test";
  } else if (provider === "crm_webhook") {
    config.url = s(formData, "url");
    config.events = formData.getAll("events").map(String);
    if (!secrets.signing_secret) secrets.signing_secret = crypto.randomBytes(24).toString("hex");
    if (!config.url) return back(path, "Enter the webhook URL", "error");
  }
  const row = { organization_id: ctx.org.id, provider, enabled: formData.get("enabled") !== "off", config, secrets_encrypted: encryptJson(secrets) };
  const { error } = existing ? await supabase.from("integrations").update(row).eq("id", existing.id) : await supabase.from("integrations").insert(row);
  if (error) return back(path, error.message, "error");
  revalidatePath(path);
  back(path, `${provider === "crm_webhook" ? "CRM webhook" : provider[0].toUpperCase() + provider.slice(1)} saved`);
}

export async function disableIntegration(formData: FormData) {
  const path = "/dashboard/settings/integrations";
  const ctx = await admin(path);
  const supabase = await createClient();
  await supabase.from("integrations").delete().eq("organization_id", ctx.org.id).eq("provider", s(formData, "provider")!);
  revalidatePath(path);
  back(path, "Integration removed");
}
