"use client";
import { useRef, useState } from "react";
import { AccessFields, BasicsFields, RegistrationTypeFields, ScheduleFields } from "./webinar-fields";
import { cn } from "@/lib/utils";

type Speaker = { name: string; title: string; bio: string; photo_url: string };
const STEPS = ["Basics", "Schedule", "Access", "Speakers", "Registration"];

export function WebinarWizard({ action, orgTz, error }: { action: (f: FormData) => void; orgTz: string; error?: string }) {
  const [step, setStep] = useState(0);
  const [speakers, setSpeakers] = useState<Speaker[]>([{ name: "", title: "", bio: "", photo_url: "" }]);
  const [submitting, setSubmitting] = useState(false);
  const refs = useRef<(HTMLFieldSetElement | null)[]>([]);

  const next = () => {
    const fs = refs.current[step];
    const invalid = fs?.querySelector<HTMLInputElement>(":invalid");
    if (invalid) { invalid.reportValidity(); return; }
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };
  const upd = (i: number, k: keyof Speaker, v: string) => setSpeakers((l) => l.map((s, j) => (j === i ? { ...s, [k]: v } : s)));

  return (
    <form action={action} onSubmit={() => setSubmitting(true)} className="card">
      <ol className="flex border-b border-slate-200 text-sm">
        {STEPS.map((s, i) => (
          <li key={s} className="flex-1">
            <button type="button" onClick={() => i < step && setStep(i)}
              className={cn("w-full px-3 py-3 text-center font-medium", i === step ? "text-brand-700 border-b-2 border-brand-600" : i < step ? "text-slate-700" : "text-slate-400")}>
              <span className="mr-1.5 hidden sm:inline">{i + 1}.</span>{s}
            </button>
          </li>
        ))}
      </ol>
      <div className="p-6">
        {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
        <fieldset ref={(el) => { refs.current[0] = el; }} hidden={step !== 0}><BasicsFields /></fieldset>
        <fieldset ref={(el) => { refs.current[1] = el; }} hidden={step !== 1}><ScheduleFields orgTz={orgTz} /></fieldset>
        <fieldset ref={(el) => { refs.current[2] = el; }} hidden={step !== 2}><AccessFields /></fieldset>
        <fieldset ref={(el) => { refs.current[3] = el; }} hidden={step !== 3}>
          <input type="hidden" name="speakers_json" value={JSON.stringify(speakers)} />
          <div className="space-y-4">
            {speakers.map((sp, i) => (
              <div key={i} className="rounded-lg border border-slate-200 p-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <input className="input" placeholder="Speaker name" value={sp.name} onChange={(e) => upd(i, "name", e.target.value)} />
                  <input className="input" placeholder="Title, e.g. Head of Growth, ACME" value={sp.title} onChange={(e) => upd(i, "title", e.target.value)} />
                  <input className="input sm:col-span-2" placeholder="Photo URL (optional — you can upload later in Settings)" value={sp.photo_url} onChange={(e) => upd(i, "photo_url", e.target.value)} />
                  <textarea className="input sm:col-span-2" rows={2} placeholder="Short bio" value={sp.bio} onChange={(e) => upd(i, "bio", e.target.value)} />
                </div>
                {speakers.length > 1 && <button type="button" className="btn-ghost btn-sm mt-2 text-red-600" onClick={() => setSpeakers((l) => l.filter((_, j) => j !== i))}>Remove</button>}
              </div>
            ))}
            <button type="button" className="btn-secondary btn-sm" onClick={() => setSpeakers((l) => [...l, { name: "", title: "", bio: "", photo_url: "" }])}>+ Add speaker</button>
          </div>
        </fieldset>
        <fieldset ref={(el) => { refs.current[4] = el; }} hidden={step !== 4}>
          <RegistrationTypeFields showTicket />
          <div className="mt-6">
            <p className="label">Registration questions</p>
            <p className="hint mb-3">Name and email are always collected. Add custom questions after creating the webinar.</p>
            <div className="grid gap-2 text-sm sm:grid-cols-2">
              <label className="flex items-center gap-2"><input type="checkbox" name="phone_required" defaultChecked /> WhatsApp number is required</label>
              <label className="flex items-center gap-2"><input type="checkbox" name="ask_company" /> Ask for company</label>
              <label className="flex items-center gap-2"><input type="checkbox" name="ask_designation" /> Ask for designation</label>
              <label className="flex items-center gap-2"><input type="checkbox" name="ask_location" /> Ask for location</label>
            </div>
          </div>
        </fieldset>
      </div>
      <div className="flex justify-between border-t border-slate-200 px-6 py-4">
        <button type="button" className="btn-secondary" disabled={step === 0} onClick={() => setStep((s) => s - 1)}>Back</button>
        {step < STEPS.length - 1
          ? <button type="button" className="btn-primary" onClick={next}>Continue</button>
          : <button type="submit" className="btn-primary" disabled={submitting}>{submitting ? "Creating…" : "Create webinar"}</button>}
      </div>
    </form>
  );
}
