import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { ORG_COOKIE } from "@/lib/org";
import { SubmitButton } from "@/components/ui/submit";

export const metadata = { title: "Join organization" };

export default async function InvitePage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ error?: string }> }) {
  const { token } = await params;
  const { error } = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  async function accept() {
    "use server";
    const sb = await createClient();
    const { data, error } = await sb.rpc("accept_invite", { p_token: token });
    if (error) redirect(`/invite/${token}?error=${encodeURIComponent(error.message)}`);
    (await cookies()).set(ORG_COOKIE, data as string, { path: "/", httpOnly: true, sameSite: "lax", maxAge: 31536000 });
    redirect("/dashboard");
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="card-pad w-full max-w-md text-center">
        <h1 className="text-lg font-semibold">You've been invited to an EventOS team</h1>
        {!user ? (
          <div className="mt-5 flex justify-center gap-2">
            <Link href={`/login?next=/invite/${token}`} className="btn-primary">Sign in to accept</Link>
            <Link href={`/signup?next=/invite/${token}`} className="btn-secondary">Create account</Link>
          </div>
        ) : (
          <form action={accept} className="mt-5">
            <p className="mb-4 text-sm text-slate-500">Signed in as {user.email}</p>
            {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
            <SubmitButton pendingText="Joining…">Accept invitation</SubmitButton>
          </form>
        )}
      </div>
    </div>
  );
}
