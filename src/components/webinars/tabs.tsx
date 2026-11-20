"use client";
import { usePathname } from "next/navigation";
import { Tabs } from "@/components/ui";

export function WebinarTabs({ id }: { id: string }) {
  const path = usePathname();
  const base = `/dashboard/webinars/${id}`;
  const items = [
    { key: "", label: "Overview" }, { key: "participants", label: "Participants" }, { key: "registration", label: "Registration" },
    { key: "messages", label: "Messages" }, { key: "automations", label: "Automations" }, { key: "insights", label: "Insights" }, { key: "settings", label: "Settings" },
  ].map((t) => ({ ...t, href: t.key ? `${base}/${t.key}` : base }));
  const active = path.replace(base, "").split("/")[1] || "";
  return <Tabs items={items} active={active} />;
}
