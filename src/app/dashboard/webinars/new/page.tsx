import { getOrgContext } from "@/lib/org";
import { PageHeader } from "@/components/ui";
import { WebinarWizard } from "@/components/webinars/wizard";
import { createWebinar } from "../actions";

export const metadata = { title: "New webinar" };

export default async function NewWebinar({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const ctx = await getOrgContext();
  const { error } = await searchParams;
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Create a webinar" description="EventOS runs the registration and follow-up; Zoom, Google Meet or YouTube hosts the live session." />
      <WebinarWizard action={createWebinar} orgTz={ctx.org.timezone} error={error} />
    </div>
  );
}
