"use client";
import { useState } from "react";

export function CopyField({ value, label }: { value: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <div>
      {label && <p className="label">{label}</p>}
      <div className="flex gap-2">
        <input readOnly value={value} className="input font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
        <button type="button" className="btn-secondary btn-sm shrink-0"
          onClick={() => { navigator.clipboard.writeText(value); setDone(true); setTimeout(() => setDone(false), 1500); }}>
          {done ? "Copied" : "Copy"}
        </button>
      </div>
    </div>
  );
}
