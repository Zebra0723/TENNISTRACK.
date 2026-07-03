// Template: a browser-safe Supabase client. Uses only PUBLIC env vars.

export const supabaseBrowserClient = `import { createClient } from "@supabase/supabase-js";

// Browser client — only uses PUBLIC values that are safe to ship to the browser.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
`;
