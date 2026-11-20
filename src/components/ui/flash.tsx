export function Flash({ searchParams }: { searchParams: { ok?: string; error?: string } }) {
  if (searchParams.error) return <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{searchParams.error}</div>;
  if (searchParams.ok) return <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{searchParams.ok}</div>;
  return null;
}
