"use client";
import { useState } from "react";

export function Share({ url, title }: { url: string; title: string }) {
  const [copied, setCopied] = useState(false);
  const u = encodeURIComponent(url), t = encodeURIComponent(title);
  const links = [
    ["WhatsApp", `https://wa.me/?text=${t}%20${u}`], ["LinkedIn", `https://www.linkedin.com/sharing/share-offsite/?url=${u}`],
    ["Facebook", `https://www.facebook.com/sharer/sharer.php?u=${u}`], ["X", `https://twitter.com/intent/tweet?text=${t}&url=${u}`],
  ];
  return (
    <div className="flex flex-wrap gap-2">
      {links.map(([l, h]) => <a key={l} href={h} target="_blank" rel="noopener noreferrer" className="btn-secondary btn-sm">{l}</a>)}
      <button type="button" className="btn-secondary btn-sm" onClick={async () => {
        if (navigator.share) { try { await navigator.share({ title, url }); return; } catch {} }
        await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1500);
      }}>{copied ? "Copied" : "Copy link"}</button>
    </div>
  );
}
