import { createBrowserClient } from "@supabase/ssr";

/** Cliente Supabase para Client Components. Usa apenas a chave pública (anon). */
export function criarClienteBrowser() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
