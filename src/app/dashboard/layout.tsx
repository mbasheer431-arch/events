import Link from "next/link";
import { getOrgContext } from "@/lib/org";
import { BrandLogo } from "@/components/brand-logo";
import { Nav } from "@/components/dashboard/nav";
import { switchOrg } from "./actions";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getOrgContext();
  return (
    <div className="min-h-screen lg:flex">
      <aside className="border-b border-slate-200 bg-white lg:fixed lg:inset-y-0 lg:w-60 lg:border-b-0 lg:border-r">
        <div className="flex h-full flex-col gap-4 p-4">
          <Link href="/dashboard" className="px-3"><BrandLogo className="h-10" /><span className="mt-1 block text-[11px] font-medium uppercase tracking-wider text-brand-600">Webinar platform</span></Link>
          {ctx.orgs.length > 1 ? (
            <form action={switchOrg}>
              <select name="org_id" defaultValue={ctx.org.id} className="input text-xs">
                {ctx.orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
              <button className="btn-ghost btn-sm mt-1 w-full">Switch organization</button>
            </form>
          ) : (
            <div className="truncate rounded-lg bg-slate-50 px-3 py-2 text-xs font-medium text-slate-600">{ctx.org.name}</div>
          )}
          <Nav />
          <div className="mt-auto space-y-2 border-t border-slate-100 pt-3">
            <p className="truncate px-3 text-xs text-slate-500">{ctx.user.email}</p>
            <form action="/auth/signout" method="post"><button className="btn-ghost btn-sm w-full justify-start">Sign out</button></form>
          </div>
        </div>
      </aside>
      <main className="flex-1 px-4 py-6 sm:px-8 lg:ml-60">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  );
}
