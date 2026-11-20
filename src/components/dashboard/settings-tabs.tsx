"use client";
import { usePathname } from "next/navigation";
import { Tabs } from "@/components/ui";

export function SettingsTabs() {
  const path = usePathname();
  const items = [
    { key: "general", label: "Organization", href: "/dashboard/settings" },
    { key: "team", label: "Team", href: "/dashboard/settings/team" },
    { key: "integrations", label: "Integrations", href: "/dashboard/settings/integrations" },
  ];
  const active = path.endsWith("/team") ? "team" : path.endsWith("/integrations") ? "integrations" : "general";
  return <Tabs items={items} active={active} />;
}
