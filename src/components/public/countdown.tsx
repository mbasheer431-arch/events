"use client";
import { useEffect, useState } from "react";

export function Countdown({ to }: { to: string }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => { setNow(Date.now()); const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  if (now === null) return null;
  const diff = new Date(to).getTime() - now;
  if (diff <= 0) return <span className="font-semibold text-emerald-600">Live now</span>;
  const d = Math.floor(diff / 86400000), h = Math.floor((diff / 3600000) % 24), m = Math.floor((diff / 60000) % 60), s = Math.floor((diff / 1000) % 60);
  const cells = [[d, "days"], [h, "hrs"], [m, "min"], [s, "sec"]] as const;
  return (
    <div className="flex gap-2">
      {cells.map(([v, l]) => (
        <div key={l} className="min-w-[3.25rem] rounded-lg bg-white/80 px-2 py-1.5 text-center shadow-sm">
          <div className="text-lg font-bold tabular-nums text-slate-900">{String(v).padStart(2, "0")}</div>
          <div className="text-[10px] uppercase tracking-wide text-slate-500">{l}</div>
        </div>
      ))}
    </div>
  );
}
