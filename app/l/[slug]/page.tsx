import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { criarClienteServico } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { robots: { index: false, follow: false } };

// Plataformas suportadas + como transformar um handle/URL num link válido.
const PLATAFORMAS: { chave: string; nome: string; url: (v: string) => string }[] = [
  { chave: "instagram", nome: "Instagram", url: (h) => `https://instagram.com/${h}` },
  { chave: "facebook", nome: "Facebook", url: (h) => `https://facebook.com/${h}` },
  { chave: "tiktok", nome: "TikTok", url: (h) => `https://tiktok.com/@${h}` },
  { chave: "linkedin", nome: "LinkedIn", url: (h) => (h.includes("/") ? `https://linkedin.com/${h}` : `https://linkedin.com/company/${h}`) },
  { chave: "youtube", nome: "YouTube", url: (h) => `https://youtube.com/${h}` },
];

function normalizar(chave: string, valor: string): string {
  const v = valor.trim();
  if (!v) return "";
  if (/^https?:\/\//i.test(v)) return v;
  const handle = v.replace(/^@/, "").replace(/^\/+/, "");
  const p = PLATAFORMAS.find((x) => x.chave === chave);
  return p ? p.url(handle) : v;
}

function normalizarSite(v?: string | null): string {
  const s = (v ?? "").trim();
  if (!s) return "";
  return /^https?:\/\//i.test(s) ? s : `https://${s}`;
}

function Icone({ chave }: { chave: string }) {
  const c = "h-5 w-5";
  switch (chave) {
    case "site":
      return (
        <svg className={c} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.5 2.5 2.5 15 0 18M12 3c-2.5 2.5-2.5 15 0 18" />
        </svg>
      );
    case "instagram":
      return (
        <svg className={c} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <rect x="2.5" y="2.5" width="19" height="19" rx="5.5" /><circle cx="12" cy="12" r="4.4" /><circle cx="17.6" cy="6.4" r="1.2" fill="currentColor" stroke="none" />
        </svg>
      );
    case "facebook":
      return (<svg className={c} viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M13.6 21.5v-7.2h2.6l.5-3.1h-3.1V9.1c0-.9.3-1.6 1.7-1.6h1.5V4.7c-.3 0-1.2-.1-2.2-.1-2.2 0-3.7 1.3-3.7 3.8v2.8H8.3v3.1h2.6v7.2h2.7z" /></svg>);
    case "linkedin":
      return (<svg className={c} viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M6.5 8.7H3.4v11.8h3.1V8.7zM5 7.3a1.8 1.8 0 1 0 0-3.6 1.8 1.8 0 0 0 0 3.6zm5.9 1.4H7.9v11.8H11v-6.2c0-1.7.6-2.8 2.1-2.8 1.4 0 1.9 1 1.9 2.8v6.2h3.1v-6.9c0-3.1-1.6-4.9-4-4.9-1.8 0-2.7 1-3.2 1.9V8.7z" /></svg>);
    case "tiktok":
      return (<svg className={c} viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M16.5 3c.3 2 1.6 3.6 3.5 3.9v2.6c-1.3.1-2.5-.3-3.6-1v5.9c0 3.3-2.7 5.6-5.7 5.1-2.4-.4-4.1-2.5-4-4.9.1-2.5 2.2-4.5 4.7-4.4.3 0 .5 0 .8.1v2.7c-.3-.1-.6-.2-.9-.2-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2V3h2.9z" /></svg>);
    case "youtube":
      return (<svg className={c} viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M21.6 7.2c-.2-.9-.9-1.6-1.8-1.8C18.1 5 12 5 12 5s-6.1 0-7.8.4c-.9.2-1.6.9-1.8 1.8C2 8.9 2 12 2 12s0 3.1.4 4.8c.2.9.9 1.6 1.8 1.8C5.9 19 12 19 12 19s6.1 0 7.8-.4c.9-.2 1.6-.9 1.8-1.8.4-1.7.4-4.8.4-4.8s0-3.1-.4-4.8zM10 15V9l5.2 3L10 15z" /></svg>);
    default:
      return (<svg className={c} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><path d="M10 13a5 5 0 0 0 7 0l2-2a5 5 0 0 0-7-7l-1 1M14 11a5 5 0 0 0-7 0l-2 2a5 5 0 0 0 7 7l1-1" /></svg>);
  }
}

export default async function LinkNaBio({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const svc = criarClienteServico();

  const { data: org } = await svc.from("orgs").select("id, nome, slug, marca").eq("slug", slug).maybeSingle();
  if (!org) notFound();

  // cliente_id (0051) — leitura tolerante
  const { data: ligacao } = await svc.from("orgs").select("cliente_id").eq("id", org.id).maybeSingle();
  const clienteId = (ligacao as { cliente_id?: string | null } | null)?.cliente_id ?? null;

  let nome = org.nome;
  let website = "";
  let redes: Record<string, string> = {};
  if (clienteId) {
    const { data: cliente } = await svc
      .from("clientes")
      .select("nome_marca, website, redes")
      .eq("id", clienteId)
      .maybeSingle();
    if (cliente) {
      nome = cliente.nome_marca || org.nome;
      website = normalizarSite(cliente.website);
      redes =
        cliente.redes && typeof cliente.redes === "object" && !Array.isArray(cliente.redes)
          ? (cliente.redes as Record<string, string>)
          : {};
    }
  }

  const marca = (org.marca as { cor?: string; logo_url?: string } | null) ?? {};
  const cor = marca.cor || "#15181D";

  const botoes: { chave: string; nome: string; href: string }[] = [];
  if (website) botoes.push({ chave: "site", nome: "Website", href: website });
  for (const p of PLATAFORMAS) {
    const v = redes[p.chave];
    if (v && v.trim()) botoes.push({ chave: p.chave, nome: p.nome, href: normalizar(p.chave, v) });
  }

  const iniciais = nome.trim().slice(0, 2).toUpperCase();

  return (
    <main
      className="flex min-h-dvh flex-col items-center px-5 py-12"
      style={{ background: `linear-gradient(180deg, ${cor}14, transparent 240px), #FBFAF7` }}
    >
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center text-center">
          {marca.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={marca.logo_url} alt={nome} className="h-20 w-20 rounded-2xl object-contain" />
          ) : (
            <div
              className="flex h-20 w-20 items-center justify-center rounded-2xl font-display text-2xl font-extrabold text-white"
              style={{ background: cor }}
            >
              {iniciais}
            </div>
          )}
          <h1 className="mt-4 font-display text-2xl font-extrabold tracking-tight text-ink">{nome}</h1>
        </div>

        {botoes.length ? (
          <div className="mt-8 flex flex-col gap-3">
            {botoes.map((b) => (
              <a
                key={b.chave}
                href={b.href}
                target="_blank"
                rel="noopener"
                className="flex items-center gap-3 rounded-2xl border border-line bg-white px-5 py-4 font-bold text-ink shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                style={{ borderColor: `${cor}33` }}
              >
                <span style={{ color: cor }}>
                  <Icone chave={b.chave} />
                </span>
                <span className="flex-1">{b.nome}</span>
                <span className="text-soft">↗</span>
              </a>
            ))}
          </div>
        ) : (
          <p className="mt-8 text-center text-sm text-soft">Ainda a preparar os links. 🖐️</p>
        )}
      </div>
    </main>
  );
}
