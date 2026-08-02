import { NextResponse, type NextRequest } from "next/server";
import { gerarLinkEntrada, enviarEmail } from "@/lib/auth/magic-link";

/**
 * Login por email: gera e envia um link de entrada seguro (landing + verifyOtp)
 * — o mesmo mecanismo do convite, para todas as marcas. Responde SEMPRE de
 * forma genérica (não revela se a conta existe) e não cria contas.
 */
const balde = new Map<string, { t: number; c: number }>();
function rate(chave: string): boolean {
  const agora = Date.now();
  if (balde.size > 5000) balde.clear();
  const b = balde.get(chave) ?? { t: agora, c: 0 };
  if (agora - b.t > 600000) {
    b.t = agora;
    b.c = 0;
  }
  b.c++;
  balde.set(chave, b);
  return b.c <= 5; // máx. 5 pedidos por 10 min por email
}

export async function POST(req: NextRequest) {
  let email = "";
  try {
    email = ((await req.json())?.email ?? "").toString().trim().toLowerCase();
  } catch {
    return NextResponse.json({ ok: true }); // genérico
  }
  if (!email.includes("@") || email.length > 200) return NextResponse.json({ ok: true });
  if (!rate(email)) return NextResponse.json({ ok: true });

  const link = await gerarLinkEntrada(email, "/sede");
  if (link) {
    const html = `
      <div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;color:#15181D">
        <p style="font-size:16px;font-weight:bold">O teu link de acesso 🖐️</p>
        <p style="font-size:15px;line-height:1.6">Carrega no botão para entrares na tua Sede. É pessoal e válido por pouco tempo.</p>
        <p style="margin:22px 0"><a href="${link}" style="background:#E8A13C;color:#15181D;font-weight:bold;padding:12px 26px;border-radius:999px;text-decoration:none;font-size:15px">Entrar na minha Sede →</a></p>
        <p style="font-size:12px;color:#9aa0a6">Não pediste este email? Ignora-o. · Nº 5, marca operada por Os Caetanos, Lda</p>
      </div>`;
    await enviarEmail(email, "O teu link de acesso — Nº 5 🖐️", html, `Entra aqui: ${link}`);
  }
  // Sempre a mesma resposta — não dizemos se a conta existe.
  return NextResponse.json({ ok: true });
}
