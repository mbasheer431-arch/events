import { Badge } from "@/components/ui";
import { Flash } from "@/components/ui/flash";
import { ConfirmButton, SubmitButton } from "@/components/ui/submit";
import { formatMoney } from "@/lib/utils";
import { addQuestion, deleteQuestion, moveQuestion, saveRegistrationForm, saveTicket, toggleTicket } from "../../actions";
import { getWebinar } from "../data";

const STD = [
  { key: "phone", label: "WhatsApp / mobile number" },
  { key: "company", label: "Company" },
  { key: "designation", label: "Designation" },
  { key: "location", label: "Location" },
];

export default async function RegistrationTab({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; error?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const { webinar: w, supabase } = await getWebinar(id);
  const [{ data: form }, { data: questions }, { data: tickets }] = await Promise.all([
    supabase.from("registration_forms").select("*").eq("webinar_id", id).maybeSingle(),
    supabase.from("registration_questions").select("*").eq("webinar_id", id).order("position"),
    supabase.from("tickets").select("*").eq("webinar_id", id).order("position"),
  ]);
  const fields = (form?.fields || {}) as Record<string, { enabled: boolean; required: boolean }>;

  return (
    <>
      <Flash searchParams={sp} />
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          <form action={saveRegistrationForm} className="card-pad space-y-4">
            <input type="hidden" name="webinar_id" value={id} />
            <h2 className="text-sm font-semibold">Standard fields</h2>
            <p className="hint -mt-2">Full name and email are always required.</p>
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-slate-500"><th className="py-1">Field</th><th>Show</th><th>Required</th></tr></thead>
              <tbody>
                {STD.map((f) => (
                  <tr key={f.key} className="border-t border-slate-100">
                    <td className="py-2">{f.label}</td>
                    <td><input type="checkbox" name={`${f.key}_enabled`} defaultChecked={fields[f.key]?.enabled} /></td>
                    <td><input type="checkbox" name={`${f.key}_required`} defaultChecked={fields[f.key]?.required} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <label className="block"><span className="label">WhatsApp / email consent text</span>
              <input name="consent_text" defaultValue={form?.consent_text} className="input" />
              <span className="hint block">Shown as a checkbox. WhatsApp messages are only sent to registrants who tick it.</span></label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block"><span className="label">Button label</span><input name="submit_label" defaultValue={form?.submit_label || "Register Now"} className="input" /></label>
              <label className="block"><span className="label">Success message</span><input name="success_message" defaultValue={form?.success_message} className="input" /></label>
            </div>
            <SubmitButton>Save form</SubmitButton>
          </form>

          <div className="card-pad">
            <h2 className="mb-3 text-sm font-semibold">Custom questions</h2>
            {questions?.length ? (
              <ul className="mb-4 divide-y divide-slate-100">
                {questions.map((q, i) => (
                  <li key={q.id} className="flex items-center gap-2 py-2 text-sm">
                    <div className="flex-1">
                      <p className="font-medium">{q.label} {q.required && <span className="text-red-500">*</span>}</p>
                      <p className="text-xs text-slate-500">{q.type}{q.options?.length ? ` · ${q.options.join(", ")}` : ""}</p>
                    </div>
                    {(["up", "down"] as const).map((dir) => (
                      <form key={dir} action={moveQuestion}>
                        <input type="hidden" name="id" value={q.id} /><input type="hidden" name="webinar_id" value={id} /><input type="hidden" name="dir" value={dir} />
                        <button className="btn-ghost btn-sm" disabled={dir === "up" ? i === 0 : i === questions.length - 1}>{dir === "up" ? "↑" : "↓"}</button>
                      </form>
                    ))}
                    <form action={deleteQuestion}><input type="hidden" name="id" value={q.id} /><input type="hidden" name="webinar_id" value={id} />
                      <ConfirmButton message="Delete this question?" className="btn-ghost btn-sm text-red-600">Delete</ConfirmButton></form>
                  </li>
                ))}
              </ul>
            ) : <p className="mb-4 text-sm text-slate-500">No custom questions yet.</p>}
            <form action={addQuestion} className="grid gap-3 rounded-lg bg-slate-50 p-4">
              <input type="hidden" name="webinar_id" value={id} />
              <input name="label" required className="input" placeholder="Question, e.g. What do you want to learn?" />
              <div className="grid gap-3 sm:grid-cols-2">
                <select name="type" className="input">
                  <option value="text">Short answer</option><option value="textarea">Paragraph</option>
                  <option value="select">Dropdown</option><option value="radio">Single choice</option><option value="checkbox">Multiple choice</option>
                </select>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="required" /> Required</label>
              </div>
              <textarea name="options" rows={2} className="input" placeholder="Options for dropdown/choice — one per line" />
              <div><SubmitButton className="btn-secondary btn-sm">Add question</SubmitButton></div>
            </form>
          </div>
        </div>

        <div className="space-y-6">
          <div className="card-pad">
            <h2 className="text-sm font-semibold">Registration type</h2>
            <p className="mt-2 text-sm text-slate-600">
              <Badge tone="blue">{w.registration_type.replace("_", " ")}</Badge>{" "}
              {w.capacity ? `· capacity ${w.capacity}` : "· unlimited capacity"}
              {w.registration_type === "invite_only" && w.invite_code ? ` · invite code ${w.invite_code}` : ""}
            </p>
            <p className="hint">Change it in the Settings tab.</p>
          </div>

          <div className="card-pad">
            <h2 className="mb-1 text-sm font-semibold">Tickets</h2>
            <p className="hint mb-3">Optional for free webinars. Any ticket priced above 0 sends registrants to Razorpay checkout.</p>
            {tickets?.length ? (
              <ul className="mb-4 divide-y divide-slate-100">
                {tickets.map((t) => (
                  <li key={t.id} className="flex items-center justify-between py-2 text-sm">
                    <div>
                      <p className="font-medium">{t.name} {!t.is_active && <Badge>inactive</Badge>}</p>
                      <p className="text-xs text-slate-500">{t.price_minor ? formatMoney(t.price_minor, t.currency) : "Free"}{t.quantity ? ` · ${t.quantity} available` : ""}</p>
                    </div>
                    <form action={toggleTicket}>
                      <input type="hidden" name="id" value={t.id} /><input type="hidden" name="webinar_id" value={id} />
                      <input type="hidden" name="active" value={String(!t.is_active)} />
                      <SubmitButton className="btn-ghost btn-sm">{t.is_active ? "Deactivate" : "Activate"}</SubmitButton>
                    </form>
                  </li>
                ))}
              </ul>
            ) : null}
            <form action={saveTicket} className="grid gap-3 rounded-lg bg-slate-50 p-4 sm:grid-cols-2">
              <input type="hidden" name="webinar_id" value={id} />
              <input name="name" required className="input sm:col-span-2" placeholder="Ticket name, e.g. Early bird" />
              <input name="price" type="number" min={0} step="0.01" className="input" placeholder="Price (0 = free)" />
              <select name="currency" className="input" defaultValue="INR"><option>INR</option><option>AED</option><option>SAR</option><option>USD</option></select>
              <input name="quantity" type="number" min={1} className="input" placeholder="Quantity (optional)" />
              <input name="description" className="input" placeholder="Short description" />
              <div><SubmitButton className="btn-secondary btn-sm">Add ticket</SubmitButton></div>
            </form>
          </div>
        </div>
      </div>
    </>
  );
}
