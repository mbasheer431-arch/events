import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { ORG_COOKIE } from "@/lib/org";
import { randomCode, slugify, TIMEZONES } from "@/lib/utils";
import { SubmitButton } from "@/components/ui/submit";

export const metadata = { title: "Set up your organization" };

async function createOrg(formData: FormData) {
  "use server";
  const supabase = await createClient();
  const name = String(formData.get("name") || "").trim();
  if (name.length < 2) redirect("/onboarding?error=Please+enter+an+organization+name");
  const slug = `${slugify(name) || "org"}-${randomCode(4).toLowerCase()}`;
  const { data, error } = await supabase.rpc("create_organization", { p_name: name, p_slug: slug, p_timezone: String(formData.get("timezone")) });
  if (error) redirect(`/onboarding?error=${encodeURIComponent(error.message)}`);
  (await cookies()).set(ORG_COOKIE, data as string, { path: "/", httpOnly: true, sameSite: "lax", maxAge: 60 * 60 * 24 * 365 });
  redirect("/dashboard");
}

export default async function Onboarding({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { error } = await searchParams;
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="card-pad w-full max-w-md">
        <h1 className="text-lg font-semibold">Set up your organization</h1>
        <p className="mt-1 text-sm text-slate-500">This is the workspace your team and webinars live in.</p>
        <form action={createOrg} className="mt-5 space-y-4">
          <label className="block"><span className="label">Organization name</span><input name="name" required className="input" placeholder="AIMER Business School" /></label>
          <label className="block"><span className="label">Default time zone</span>
            <select name="timezone" className="input" defaultValue="Asia/Kolkata">{TIMEZONES.map((t) => <option key={t}>{t}</option>)}</select>
          </label>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <SubmitButton className="btn-primary w-full" pendingText="Creating…">Create organization</SubmitButton>
        </form>
      </div>
    </div>
  );
}
