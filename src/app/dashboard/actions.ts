"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ORG_COOKIE, getOrgContext } from "@/lib/org";

export async function switchOrg(formData: FormData) {
  const ctx = await getOrgContext();
  const id = String(formData.get("org_id"));
  if (ctx.orgs.some((o) => o.id === id)) {
    (await cookies()).set(ORG_COOKIE, id, { path: "/", httpOnly: true, sameSite: "lax", maxAge: 31536000 });
  }
  redirect("/dashboard");
}
