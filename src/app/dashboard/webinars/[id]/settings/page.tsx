import { Flash } from "@/components/ui/flash";
import { ConfirmButton, SubmitButton } from "@/components/ui/submit";
import { AccessFields, BasicsFields, RegistrationTypeFields, ScheduleFields } from "@/components/webinars/webinar-fields";
import { utcToLocalInput } from "@/lib/utils";
import { addSpeaker, deleteSpeaker, updateWebinar } from "../../actions";
import { getWebinar } from "../data";

export default async function WebinarSettings({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; error?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const { webinar: w, ctx, supabase } = await getWebinar(id);
  const { data: speakers } = await supabase.from("webinar_speakers").select("*").eq("webinar_id", id).order("position");
  const d = { ...w, starts_at_local: utcToLocalInput(w.starts_at, w.timezone) };

  return (
    <>
      <Flash searchParams={sp} />
      <div className="grid gap-6 lg:grid-cols-3">
        <form action={updateWebinar} className="space-y-6 lg:col-span-2">
          <input type="hidden" name="id" value={id} />
          <section className="card-pad"><h2 className="mb-4 text-sm font-semibold">Webinar information</h2><BasicsFields d={d} /></section>
          <section className="card-pad"><h2 className="mb-4 text-sm font-semibold">Schedule</h2><ScheduleFields d={d} orgTz={ctx.org.timezone} />
            <p className="hint mt-3">Changing the time automatically reschedules every pending reminder.</p></section>
          <section className="card-pad"><h2 className="mb-4 text-sm font-semibold">Access</h2><AccessFields d={d} /></section>
          <section className="card-pad"><h2 className="mb-4 text-sm font-semibold">Registration</h2><RegistrationTypeFields d={d} /></section>
          <section className="card-pad">
            <h2 className="mb-4 text-sm font-semibold">Follow-up links</h2>
            <div className="grid gap-4">
              <label className="block"><span className="label">Replay URL</span><input name="replay_url" type="url" defaultValue={w.replay_url || ""} className="input" placeholder="https://youtube.com/…" /></label>
              <label className="block"><span className="label">Feedback form URL</span><input name="feedback_url" type="url" defaultValue={w.feedback_url || ""} className="input" placeholder="https://forms.gle/…" /></label>
              <label className="block"><span className="label">Next-step CTA URL</span><input name="next_step_url" type="url" defaultValue={w.next_step_url || ""} className="input" placeholder="Course page, counselling booking, next webinar…" /></label>
            </div>
          </section>
          <div className="sticky bottom-4 flex justify-end"><SubmitButton>Save changes</SubmitButton></div>
        </form>

        <aside className="card-pad h-fit">
          <h2 className="mb-3 text-sm font-semibold">Speakers</h2>
          <ul className="mb-4 space-y-3">
            {(speakers || []).map((s) => (
              <li key={s.id} className="flex items-start gap-3">
                {s.photo_url ? <img src={s.photo_url} alt="" className="h-10 w-10 rounded-full object-cover" />
                  : <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-50 text-sm font-semibold text-brand-700">{s.name[0]}</div>}
                <div className="flex-1 text-sm"><p className="font-medium">{s.name}</p><p className="text-xs text-slate-500">{s.title}</p></div>
                <form action={deleteSpeaker}><input type="hidden" name="id" value={s.id} /><input type="hidden" name="webinar_id" value={id} />
                  <ConfirmButton message="Remove this speaker?" className="btn-ghost btn-sm text-red-600">✕</ConfirmButton></form>
              </li>
            ))}
          </ul>
          <form action={addSpeaker} className="space-y-2">
            <input type="hidden" name="webinar_id" value={id} />
            <input type="hidden" name="position" value={speakers?.length || 0} />
            <input name="name" required className="input" placeholder="Name" />
            <input name="title" className="input" placeholder="Title" />
            <textarea name="bio" rows={2} className="input" placeholder="Bio" />
            <input name="photo" type="file" accept="image/*" className="input" />
            <SubmitButton className="btn-secondary btn-sm">Add speaker</SubmitButton>
          </form>
        </aside>
      </div>
    </>
  );
}
