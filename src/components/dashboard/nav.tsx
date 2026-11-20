"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const items = [
  { href: "/dashboard", label: "Overview", desc: "Registrations and performance", exact: true },
  { href: "/dashboard/webinars", label: "Webinars", desc: "Create and manage webinars" },
  { href: "/dashboard/participants", label: "Participants", desc: "Registered attendees" },
  { href: "/dashboard/whatsapp", label: "WhatsApp", desc: "WATI connection and messages" },
  { href: "/dashboard/automations", label: "Automations", desc: "Reminders and follow-ups" },
  { href: "/dashboard/analytics", label: "Analytics", desc: "Performance and conversion" },
  { href: "/dashboard/settings", label: "Settings", desc: "Team, email and integrations" },
];

export function Nav() {
  const path = usePathname();
  return (
    <nav className="space-y-0.5">
      {items.map((i) => {
        const active = i.exact ? path === i.href : path.startsWith(i.href);
        return (
          <Link key={i.href} href={i.href} title={i.desc}
            className={cn("block rounded-lg px-3 py-2 text-sm font-medium", active ? "bg-brand-50 text-brand-700" : "text-slate-600 hover:bg-slate-100")}>
            {i.label}
          </Link>
        );
      })}
    </nav>
  );
}
