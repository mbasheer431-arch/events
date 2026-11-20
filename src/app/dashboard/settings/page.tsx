import { getOrgContext } from "@/lib/org";
import { TIMEZONES } from "@/lib/utils";
import { Flash } from "@/components/ui/flash";
import { SubmitButton } from "@/components/ui/submit";
import { updateOrg } from "./actions";

export const metadata = { title: "Settings" };

export default async function GeneralSettings({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const sp = await searchParams;
  const { org, role } = await getOrgContext();
  return (
    <>
      <Flash searchParams={sp} />
      <form action={updateOrg} className="card-pad grid max-w-2xl gap-4 sm:grid-cols-2">
        <label className="block sm:col-span-2"><span className="label">Organization name</span><input name="name" defaultValue={org.name} className="input" /></label>
        <label className="block"><span className="label">Default time zone</span>
          <select name="timezone" defaultValue={org.timezone} className="input">{TIMEZONES.map((t) => <option key={t}>{t}</option>)}</select></label>
        <label className="block"><span className="label">Website</span><input name="website" type="url" defaultValue={org.website || ""} className="input" /></label>
        <label className="block sm:col-span-2"><span className="label">Logo URL</span><input name="logo_url" type="url" defaultValue={org.logo_url || ""} className="input" />
          <span className="hint block">Shown on registration pages.</span></label>
        <label className="block"><span className="label">Email sender name</span><input name="email_from_name" defaultValue={org.email_from_name || ""} className="input" placeholder={org.name} /></label>
        <label className="block"><span className="label">Reply-to email</span><input name="email_reply_to" type="email" defaultValue={org.email_reply_to || ""} className="input" /></label>
        <div className="sm:col-span-2">{role !== "member" ? <SubmitButton>Save</SubmitButton> : <p className="hint">Only admins can edit these settings.</p>}</div>
      </form>
    </>
  );
}
