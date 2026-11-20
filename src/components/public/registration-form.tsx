"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { getAttribution, getVisitorId } from "./tracker";

type Q = { id: string; label: string; type: string; options: string[]; required: boolean };
type T = { id: string; name: string; description: string | null; price_minor: number; currency: string };
type Fields = Record<string, { enabled: boolean; required: boolean }>;

declare global { interface Window { Razorpay?: any } }

function loadRazorpay() {
  return new Promise<boolean>((resolve) => {
    if (window.Razorpay) return resolve(true);
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.onload = () => resolve(true); s.onerror = () => resolve(false);
    document.body.appendChild(s);
  });
}

const money = (m: number, c: string) => new Intl.NumberFormat("en-IN", { style: "currency", currency: c }).format(m / 100);

export function RegistrationForm(props: {
  webinarId: string; slug: string; title: string; orgName: string; fields: Fields; questions: Q[]; tickets: T[];
  consentText: string; submitLabel: string; inviteRequired: boolean; full: boolean;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ticketId, setTicketId] = useState(props.tickets[0]?.id || "");
  const [started, setStarted] = useState(false);
  const f = props.fields;

  const onFirstFocus = () => {
    if (started) return;
    setStarted(true);
    navigator.sendBeacon?.("/api/v1/track", new Blob([JSON.stringify({ webinar_id: props.webinarId, event_type: "form_start", visitor_id: getVisitorId(), attribution: getAttribution(props.webinarId) })], { type: "application/json" }));
  };

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true); setError(null);
    const fd = new FormData(e.currentTarget);
    const answers: Record<string, string | string[]> = {};
    for (const q of props.questions) answers[q.id] = q.type === "checkbox" ? fd.getAll(`q_${q.id}`).map(String) : String(fd.get(`q_${q.id}`) || "");
    const invite = new URL(window.location.href).searchParams.get("invite");
    const payload = {
      full_name: fd.get("full_name"), email: fd.get("email"), phone: fd.get("phone") || null,
      company: fd.get("company") || null, designation: fd.get("designation") || null, location: fd.get("location") || null,
      ticket_id: ticketId || null, invite_code: invite, consent: fd.get("consent") === "on", answers,
      attribution: getAttribution(props.webinarId), visitor_id: getVisitorId(),
    };
    try {
      const res = await fetch(`/api/v1/webinars/${props.webinarId}/register`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Registration failed");

      if (data.payment) {
        if (!(await loadRazorpay())) throw new Error("Could not load the payment window. Check your connection and try again.");
        const rzp = new window.Razorpay({
          key: data.payment.key_id, order_id: data.payment.order_id, amount: data.payment.amount, currency: data.payment.currency,
          name: props.orgName, description: props.title,
          prefill: { name: payload.full_name, email: payload.email, contact: payload.phone || undefined },
          notes: { participant_code: data.participant_code },
          theme: { color: "#127489" },
          handler: async (resp: any) => {
            const v = await fetch(`/api/v1/webinars/${props.webinarId}/register/verify`, {
              method: "POST", headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ participant_code: data.participant_code, ...resp }),
            });
            const vd = await v.json();
            if (!v.ok) { setError(vd.error || "Payment could not be verified. If money was deducted, it will be confirmed automatically."); setLoading(false); return; }
            router.push(`/e/${props.slug}/registered?code=${data.participant_code}`);
          },
          modal: { ondismiss: () => { setLoading(false); setError("Payment was not completed. You can try again."); } },
        });
        rzp.on("payment.failed", (r: any) => setError(r?.error?.description || "Payment failed"));
        rzp.open();
        return;
      }
      router.push(`/e/${props.slug}/registered?code=${data.participant_code}${data.duplicate ? "&dup=1" : ""}`);
    } catch (err: any) {
      setError(err.message); setLoading(false);
    }
  }

  if (props.full) return <div className="rounded-lg bg-amber-50 p-4 text-sm text-amber-800">Registrations are full for this webinar.</div>;

  const ticket = props.tickets.find((t) => t.id === ticketId);
  return (
    <form onSubmit={submit} onFocus={onFirstFocus} className="space-y-3">
      {props.inviteRequired && <p className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600">This is an invite-only webinar — use the link from your invitation.</p>}
      <input name="full_name" required placeholder="Full name *" className="input" autoComplete="name" />
      <input name="email" type="email" required placeholder="Email address *" className="input" autoComplete="email" />
      {f.phone?.enabled && <input name="phone" type="tel" required={f.phone.required} placeholder={`WhatsApp number with country code${f.phone.required ? " *" : ""}`} className="input" autoComplete="tel" />}
      {(["company", "designation", "location"] as const).map((k) => f[k]?.enabled && (
        <input key={k} name={k} required={f[k].required} placeholder={`${k[0].toUpperCase()}${k.slice(1)}${f[k].required ? " *" : ""}`} className="input" />
      ))}
      {props.questions.map((q) => (
        <div key={q.id}>
          <p className="mb-1 text-sm font-medium text-slate-700">{q.label}{q.required && " *"}</p>
          {q.type === "text" && <input name={`q_${q.id}`} required={q.required} className="input" />}
          {q.type === "textarea" && <textarea name={`q_${q.id}`} required={q.required} rows={3} className="input" />}
          {q.type === "select" && (
            <select name={`q_${q.id}`} required={q.required} className="input" defaultValue=""><option value="" disabled>Choose…</option>{q.options.map((o) => <option key={o}>{o}</option>)}</select>
          )}
          {(q.type === "radio" || q.type === "checkbox") && (
            <div className="space-y-1">{q.options.map((o) => (
              <label key={o} className="flex items-center gap-2 text-sm"><input type={q.type} name={`q_${q.id}`} value={o} required={q.required && q.type === "radio"} /> {o}</label>
            ))}</div>
          )}
        </div>
      ))}
      {props.tickets.length > 1 && (
        <div className="space-y-2">
          {props.tickets.map((t) => (
            <label key={t.id} className={`flex cursor-pointer items-center justify-between rounded-lg border p-3 text-sm ${ticketId === t.id ? "border-brand-500 bg-brand-50" : "border-slate-200"}`}>
              <span className="flex items-center gap-2"><input type="radio" checked={ticketId === t.id} onChange={() => setTicketId(t.id)} />
                <span><span className="font-medium">{t.name}</span>{t.description && <span className="block text-xs text-slate-500">{t.description}</span>}</span></span>
              <span className="font-semibold">{t.price_minor ? money(t.price_minor, t.currency) : "Free"}</span>
            </label>
          ))}
        </div>
      )}
      <label className="flex items-start gap-2 text-xs text-slate-600"><input type="checkbox" name="consent" defaultChecked className="mt-0.5" /> {props.consentText}</label>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button disabled={loading} className="btn-primary w-full py-3 text-base">
        {loading ? "Please wait…" : ticket?.price_minor ? `${props.submitLabel} · ${money(ticket.price_minor, ticket.currency)}` : props.submitLabel}
      </button>
    </form>
  );
}
