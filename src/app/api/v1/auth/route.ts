import { createClient } from "@/lib/supabase/server";
import { json } from "@/lib/http";

/** GET current session user. Sign-in/up happen through Supabase Auth in the browser. */
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return json({ user: user ? { id: user.id, email: user.email } : null });
}
