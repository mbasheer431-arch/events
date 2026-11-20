import { PageHeader } from "@/components/ui";
import { SettingsTabs } from "@/components/dashboard/settings-tabs";

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (<><PageHeader title="Settings" /><SettingsTabs />{children}</>);
}
