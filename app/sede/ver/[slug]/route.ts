import { NextRequest, NextResponse } from "next/server";
import { criarClienteServidor } from "@/lib/supabase/server";

/**
 * «Ver como cliente» — a equipa do Nº 5 abre a Sede de um cliente em pré-visualização.
 * Guarda o cliente escolhido num cookie e leva à Sede. SÓ staff (externo=false).
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await criarClienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", req.url));

  const { data: perfil } = await supabase.from("profiles").select("externo").eq("id", user.id).maybeSingle();
  if (perfil?.externo !== false) return NextResponse.redirect(new URL("/sede", req.url)); // só staff

  const res = NextResponse.redirect(new URL("/sede", req.url));
  res.cookies.set("sede_org", slug, { path: "/", httpOnly: true, sameSite: "lax" });
  return res;
}
