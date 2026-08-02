import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { criarClienteServidor } from "@/lib/supabase/server";

/**
 * Confirma um convite/magic link pelo token_hash (fluxo server-side).
 * Ao contrário do PKCE (?code=), funciona em QUALQUER dispositivo — é o que
 * torna os convites da Sede fiáveis. O link aponta para o nosso domínio, por
 * isso não depende do Site URL / Redirect URLs configurados no Supabase.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const token_hash = searchParams.get("token_hash");
  const type = (searchParams.get("type") ?? "magiclink") as EmailOtpType;
  const proximo = searchParams.get("proximo") ?? "/sede";

  if (token_hash) {
    const supabase = await criarClienteServidor();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash });
    if (!error) return NextResponse.redirect(`${origin}${proximo}`);
  }
  return NextResponse.redirect(`${origin}/login?erro=link-expirado`);
}
