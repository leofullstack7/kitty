import { createClient } from "@supabase/supabase-js";

export function supabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function persistPublicFile(relPath: string, body: Buffer, contentType: string) {
  const sb = supabaseAdmin();
  if (!sb) return null;
  const path = relPath.replace(/^\/+/, "");
  const { error } = await sb.storage.from("media").upload(path, body, { contentType, upsert: true });
  if (error) throw new Error(error.message);
  const { data } = sb.storage.from("media").getPublicUrl(path);
  return data.publicUrl;
}
