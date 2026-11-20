import "server-only";
import { cache } from "react";
import { notFound } from "next/navigation";
import { getOrgContext } from "@/lib/org";
import { createClient } from "@/lib/supabase/server";

export const getWebinar = cache(async (id: string) => {
  const ctx = await getOrgContext();
  const supabase = await createClient();
  const { data } = await supabase.from("webinars").select("*").eq("id", id).eq("organization_id", ctx.org.id).maybeSingle();
  if (!data) notFound();
  return { webinar: data, ctx, supabase };
});
