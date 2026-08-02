import { NextResponse, type NextRequest } from "next/server";

/**
 * Compatibilidade: links antigos apontavam para aqui. Reencaminha para a
 * landing com botão (/auth/entrar) SEM consumir o token — o verifyOtp só
 * acontece quando a pessoa carrega no botão lá (protege dos scanners de email).
 */
export function GET(request: NextRequest) {
  const { search, origin } = request.nextUrl;
  return NextResponse.redirect(`${origin}/auth/entrar${search}`);
}
