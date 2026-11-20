"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { BrandLogo } from "@/components/brand-logo";

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/dashboard";
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true); setError(null);
    const f = new FormData(e.currentTarget);
    const email = String(f.get("email")), password = String(f.get("password"));
    const supabase = createClient();
    if (mode === "login") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) { setError(error.message); setLoading(false); return; }
      router.replace(next); router.refresh();
    } else {
      const { data, error } = await supabase.auth.signUp({
        email, password,
        options: { data: { full_name: String(f.get("full_name")) }, emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
      });
      if (error) { setError(error.message); setLoading(false); return; }
      if (data.session) { router.replace(next === "/dashboard" ? "/onboarding" : next); router.refresh(); }
      else { setNotice("Check your inbox to confirm your email, then sign in."); setLoading(false); }
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <Link href="/" className="mb-8 flex justify-center"><BrandLogo className="h-12" /></Link>
        <div className="card-pad">
          <h1 className="text-lg font-semibold">{mode === "login" ? "Sign in" : "Create your account"}</h1>
          <form onSubmit={onSubmit} className="mt-5 space-y-4">
            {mode === "signup" && (
              <label className="block"><span className="label">Full name</span><input name="full_name" required className="input" autoComplete="name" /></label>
            )}
            <label className="block"><span className="label">Email</span><input name="email" type="email" required className="input" autoComplete="email" /></label>
            <label className="block"><span className="label">Password</span><input name="password" type="password" required minLength={8} className="input" autoComplete={mode === "login" ? "current-password" : "new-password"} /></label>
            {error && <p className="text-sm text-red-600">{error}</p>}
            {notice && <p className="text-sm text-emerald-700">{notice}</p>}
            <button disabled={loading} className="btn-primary w-full">{loading ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}</button>
          </form>
        </div>
        <p className="mt-4 text-center text-sm text-slate-500">
          {mode === "login" ? <>New here? <Link className="text-brand-600" href={`/signup?next=${encodeURIComponent(next)}`}>Create an account</Link></>
            : <>Already have an account? <Link className="text-brand-600" href={`/login?next=${encodeURIComponent(next)}`}>Sign in</Link></>}
        </p>
      </div>
    </div>
  );
}
