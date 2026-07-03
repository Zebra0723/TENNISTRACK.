// Template: a server-only Supabase client. May use the service role key, which
// must NEVER be imported into browser/client code.

export const supabaseServerClient = `import { createClient } from "@supabase/supabase-js";

// Server-only client. The service role key bypasses Row Level Security, so this
// file must only ever be imported from server code (Route Handlers, Server
// Actions, server components) — never from a Client Component.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export function createServerSupabaseClient() {
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
`;
