import Link from "next/link";
import { cn } from "@/lib/utils";

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Stat({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return (
    <div className="card-pad">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-slate-900">{value}</p>
      {sub && <p className="mt-1 text-xs text-slate-500">{sub}</p>}
    </div>
  );
}

const tones: Record<string, string> = {
  green: "bg-emerald-50 text-emerald-700", red: "bg-red-50 text-red-700", amber: "bg-amber-50 text-amber-700",
  blue: "bg-brand-50 text-brand-700", slate: "bg-slate-100 text-slate-600", violet: "bg-violet-50 text-violet-700",
};
export function Badge({ tone = "slate", children }: { tone?: keyof typeof tones | string; children: React.ReactNode }) {
  return <span className={cn("badge", tones[tone] || tones.slate)}>{children}</span>;
}

const statusTone: Record<string, string> = {
  published: "green", draft: "slate", completed: "blue", cancelled: "red",
  confirmed: "green", pending_payment: "amber", pending_approval: "amber", rejected: "red",
  paid: "green", pending: "amber", failed: "red", not_required: "slate", refunded: "violet",
  sent: "blue", delivered: "green", read: "violet", done: "green", skipped: "slate", running: "blue",
};
export function StatusBadge({ status }: { status: string }) {
  return <Badge tone={statusTone[status] || "slate"}>{status.replace(/_/g, " ")}</Badge>;
}

export function Empty({ title, description, action }: { title: string; description?: string; action?: React.ReactNode }) {
  return (
    <div className="card flex flex-col items-center px-6 py-14 text-center">
      <h3 className="text-base font-semibold">{title}</h3>
      {description && <p className="mt-1 max-w-md text-sm text-slate-500">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Tabs({ items, active }: { items: { href: string; label: string; key: string }[]; active: string }) {
  return (
    <div className="mb-6 flex gap-1 overflow-x-auto border-b border-slate-200">
      {items.map((t) => (
        <Link key={t.key} href={t.href}
          className={cn("whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium",
            t.key === active ? "border-brand-600 text-brand-700" : "border-transparent text-slate-500 hover:text-slate-800")}>
          {t.label}
        </Link>
      ))}
    </div>
  );
}

export function Field({ label, hint, children, className }: { label: string; hint?: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={cn("block", className)}>
      <span className="label">{label}</span>
      {children}
      {hint && <span className="hint block">{hint}</span>}
    </label>
  );
}

export function BarChart({ data }: { data: { label: string; value: number }[] }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="flex h-40 items-end gap-[3px]">
      {data.map((d) => (
        <div key={d.label} className="group relative flex-1">
          <div className="rounded-t bg-brand-500/80 group-hover:bg-brand-600" style={{ height: `${Math.max(2, (d.value / max) * 150)}px` }} />
          <div className="pointer-events-none absolute -top-7 left-1/2 hidden -translate-x-1/2 whitespace-nowrap rounded bg-slate-900 px-1.5 py-0.5 text-[10px] text-white group-hover:block">
            {d.label}: {d.value}
          </div>
        </div>
      ))}
    </div>
  );
}
