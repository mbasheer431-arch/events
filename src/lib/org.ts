import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export const ORG_COOKIE = "eventos_org";

export type OrgContext = {
  user: { id: string; email: string };
  org: { id: string; name: string; slug: string; timezone: string; logo_url: string | null; email_from_name: string | null; email_reply_to: string | null; website: string | null };
  role: "owner" | "admin" | "member";
  orgs: { id: string; name: string }[];
};

/** Resolves the signed-in user + active organization. Redirects when missing. */
export const getOrgContext = cache(async (): Promise<OrgContext> => {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: memberships } = await supabase
    .from("organization_members")
    .select("role, organizations(id, name, slug, timezone, logo_url, email_from_name, email_reply_to, website)")
    .eq("user_id", user.id);

  const list = (memberships || [])
    .map((m) => ({ role: m.role as OrgContext["role"], org: m.organizations as unknown as OrgContext["org"] }))
    .filter((m) => m.org);
  if (!list.length) redirect("/onboarding");

  const wanted = (await cookies()).get(ORG_COOKIE)?.value;
  const active = list.find((m) => m.org.id === wanted) || list[0];
  return {
    user: { id: user.id, email: user.email! },
    org: active.org,
    role: active.role,
    orgs: list.map((m) => ({ id: m.org.id, name: m.org.name })),
  };
});

export async function requireAdmin() {
  const ctx = await getOrgContext();
  if (ctx.role === "member") throw new Error("Only owners and admins can change this setting.");
  return ctx;
}
