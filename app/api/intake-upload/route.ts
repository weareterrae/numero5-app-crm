import { NextResponse, type NextRequest } from "next/server";
import { criarClienteServico } from "@/lib/supabase/server";

/**
 * Upload de materiais no diagnóstico público (/intake/[token]).
 * Segurança: token de intake válido + extensões de trabalho + 10 MB/ficheiro +
 * máx. 10 ficheiros por cliente. Guarda no bucket privado «materiais» e regista
 * na biblioteca do cliente (origem: cliente). Same-origin — sem CORS.
 */

const EXTENSOES_OK = new Set([
  "pdf", "png", "jpg", "jpeg", "webp", "gif", "svg",
  "doc", "docx", "xls", "xlsx", "ppt", "pptx", "csv", "txt", "zip", "mp4", "mp3",
]);
const MAX_BYTES = 10 * 1024 * 1024;
const MAX_FICHEIROS = 10;

export async function POST(req: NextRequest) {
  let fd: FormData;
  try {
    fd = await req.formData();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const token = (fd.get("token") ?? "").toString().trim();
  const f = fd.get("ficheiro");
  if (!token || !(f instanceof File) || f.size === 0)
    return NextResponse.json({ ok: false, erro: "pedido incompleto" }, { status: 400 });
  if (f.size > MAX_BYTES)
    return NextResponse.json({ ok: false, erro: "máx. 10 MB por ficheiro" }, { status: 200 });
  const ext = (f.name.split(".").pop() ?? "").toLowerCase();
  if (!EXTENSOES_OK.has(ext))
    return NextResponse.json({ ok: false, erro: "tipo de ficheiro não suportado" }, { status: 200 });

  const supabase = criarClienteServico();

  const { data: cliente } = await supabase
    .from("clientes")
    .select("id")
    .eq("intake_token", token)
    .maybeSingle();
  if (!cliente) return NextResponse.json({ ok: false }, { status: 404 });

  // Tecto por cliente (anti-abuso do link público).
  const { count } = await supabase
    .from("biblioteca_conteudos")
    .select("id", { count: "exact", head: true })
    .eq("cliente_id", cliente.id)
    .eq("origem", "cliente")
    .then((r) => r, () => ({ count: 0 }));
  if ((count ?? 0) >= MAX_FICHEIROS)
    return NextResponse.json({ ok: false, erro: "limite de ficheiros atingido" }, { status: 200 });

  const nomeLimpo = f.name.replace(/[^\w.\-]+/g, "_").slice(-80);
  const caminho = `${cliente.id}/intake/${crypto.randomUUID().slice(0, 8)}-${nomeLimpo}`;
  const { error: upErr } = await supabase.storage
    .from("materiais")
    .upload(caminho, f, { contentType: f.type || undefined });
  if (upErr) return NextResponse.json({ ok: false, erro: "não foi possível guardar" }, { status: 200 });

  // Regista na biblioteca (tolerante à coluna «ficheiro»); falha não desfaz o upload.
  const base = {
    cliente_id: cliente.id,
    tema: `📎 Material do diagnóstico: ${f.name.slice(0, 80)}`,
    origem: "cliente",
    licenca: "autorizada",
    reutilizavel: true,
  };
  const { error: insErr } = await supabase
    .from("biblioteca_conteudos")
    .insert({ ...base, ficheiro: caminho } as unknown as typeof base);
  if (insErr) await supabase.from("biblioteca_conteudos").insert(base);

  return NextResponse.json({ ok: true });
}
