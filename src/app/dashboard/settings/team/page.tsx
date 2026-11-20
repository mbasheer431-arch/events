import { getOrgContext } from "@/lib/org";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui";
import { Flash } from "@/components/ui/flash";
import { ConfirmButton, SubmitButton } from "@/components/ui/submit";
import { formatDateTime } from "@/lib/utils";
import { inviteMember, revokeInvite, updateMember } from "../actions";

export default async function TeamSettings({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const sp = await searchParams;
  const ctx = await getOrgContext();
  const supabase = await createClient();
  const [{ data: members }, { data: invites }] = await Promise.all([
    supabase.from("organization_members").select("role, created_at, users(id, email, full_name)").eq("organization_id", ctx.org.id),
    ctx.role !== "member" ? supabase.from("organization_invites").select("*").eq("organization_id", ctx.org.id).is("accepted_at", null).order("created_at", { ascending: false }) : Promise.resolve({ data: [] as any[] }),
  ]);
  const isAdmin = ctx.role !== "member";
  return (
    <>
      <Flash searchParams={sp} />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="card overflow-x-auto lg:col-span-2">
          <table className="table"><thead><tr><th>Member</th><th>Role</th><th>Joined</th>{isAdmin && <th></th>}</tr></thead>
            <tbody>{(members || []).map((m) => {
              const u = m.users as any;
              return (
                <tr key={u.id}>
                  <td><p className="font-medium">{u.full_name}</p><p className="text-xs text-slate-500">{u.email}</p></td>
                  <td><Badge tone={m.role === "owner" ? "violet" : m.role === "admin" ? "blue" : "slate"}>{m.role}</Badge></td>
                  <td className="text-slate-500">{formatDateTime(m.created_at, ctx.org.timezone)}</td>
                  {isAdmin && (
                    <td>{u.id !== ctx.user.id && (
                      <div className="flex gap-2">
                        <form action={updateMember} className="flex gap-1"><input type="hidden" name="user_id" value={u.id} />
                          <select name="role" defaultValue={m.role} className="input py-1 text-xs"><option value="member">Member</option><option value="admin">Admin</option>{ctx.role === "owner" && <option value="owner">Owner</option>}</select>
                          <SubmitButton className="btn-secondary btn-sm">Save</SubmitButton></form>
                        <form action={updateMember}><input type="hidden" name="user_id" value={u.id} /><input type="hidden" name="action" value="remove" />
                          <ConfirmButton message="Remove this member?">Remove</ConfirmButton></form>
                      </div>)}</td>
                  )}
                </tr>
              );
            })}</tbody></table>
        </div>
        {isAdmin && (
          <div className="space-y-6">
            <form action={inviteMember} className="card-pad space-y-3">
              <h2 className="text-sm font-semibold">Invite a teammate</h2>
              <input name="email" type="email" required className="input" placeholder="name@company.com" />
              <select name="role" className="input"><option value="member">Member — manage webinars & participants</option><option value="admin">Admin — also integrations & team</option></select>
              <SubmitButton pendingText="Sending…">Send invite</SubmitButton>
            </form>
            {!!invites?.length && (
              <div className="card-pad"><h2 className="mb-2 text-sm font-semibold">Pending invites</h2>
                <ul className="space-y-2 text-sm">{invites.map((i) => (
                  <li key={i.id} className="flex items-center justify-between"><span>{i.email} <span className="text-xs text-slate-500">({i.role})</span></span>
                    <form action={revokeInvite}><input type="hidden" name="id" value={i.id} /><button className="btn-ghost btn-sm text-red-600">Revoke</button></form></li>
                ))}</ul></div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
