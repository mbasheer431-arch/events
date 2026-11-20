import Link from "next/link";
export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 px-4 text-center">
      <h1 className="text-2xl font-bold">Page not found</h1>
      <p className="text-slate-500">This page doesn't exist or the webinar isn't published.</p>
      <Link href="/" className="btn-secondary">Go home</Link>
    </div>
  );
}
