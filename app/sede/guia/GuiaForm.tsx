"use client";

import { useMemo, useRef, useState, type ChangeEvent } from "react";
import { guardarGuia, concluirGuia, anexarMaterialGuia, removerAnexoGuia, type Anexo } from "./acoes";

type Campo = { id: string; label: string; ajuda?: string; sugerivel?: boolean; linhas?: number };
type Seccao = { titulo: string; icone: string; campos: Campo[] };

const SECOES: Seccao[] = [
  {
    titulo: "A marca",
    icone: "①",
    campos: [
      { id: "marca_oque", label: "O que fazem, em poucas palavras?", sugerivel: true },
      { id: "marca_diferenca", label: "O que vos torna diferentes da concorrência?", sugerivel: true },
      { id: "marca_missao", label: "A vossa missão, numa frase.", sugerivel: true, linhas: 2 },
    ],
  },
  {
    titulo: "Quem queremos alcançar",
    icone: "②",
    campos: [
      { id: "publico_quem", label: "Quem é o vosso cliente ideal?", sugerivel: true },
      { id: "publico_onde", label: "Onde está e onde passa o tempo (redes, sítios)?", sugerivel: true },
      { id: "publico_move", label: "O que o move na hora de escolher?", sugerivel: true },
    ],
  },
  {
    titulo: "Objetivos",
    icone: "③",
    campos: [
      { id: "obj_metas", label: "O que querem alcançar nos próximos 3 a 6 meses?", ajuda: "vender mais, notoriedade, leads, recrutar distribuidores…", sugerivel: true },
      { id: "obj_sucesso", label: "Como saberão que resultou? (o que medir)", sugerivel: true },
    ],
  },
  {
    titulo: "Tom de voz ⭐",
    icone: "④",
    campos: [
      { id: "tom_soar", label: "Como querem soar?", ajuda: "ex.: próximo e caloroso · sério e técnico · divertido…", sugerivel: true },
      { id: "tom_palavras", label: "3 palavras que descrevem a personalidade da marca.", sugerivel: true, linhas: 2 },
      { id: "tom_usar", label: "Palavras e expressões que gostam de usar.", sugerivel: true, linhas: 2 },
      { id: "tom_evitar", label: "Palavras e expressões a evitar.", sugerivel: true, linhas: 2 },
      { id: "tom_refs", label: "Marcas cujo tom de comunicação admiram.", linhas: 2 },
    ],
  },
  {
    titulo: "O que comunicar",
    icone: "⑤",
    campos: [
      { id: "com_destacar", label: "Produtos ou serviços a destacar.", sugerivel: true },
      { id: "com_mensagens", label: "Mensagens-chave que nunca podem faltar.", sugerivel: true },
      { id: "com_nunca", label: "O que nunca dizer ou mostrar.", linhas: 2 },
    ],
  },
  {
    titulo: "Visual",
    icone: "⑥",
    campos: [
      { id: "vis_cores", label: "Cores da marca (ou o que gostam).", linhas: 2 },
      { id: "vis_gostam", label: "Referências visuais que gostam.", linhas: 2 },
      { id: "vis_evitar", label: "O que não gostam visualmente.", linhas: 2 },
    ],
  },
  {
    titulo: "Canais e concorrência",
    icone: "⑦",
    campos: [
      { id: "can_onde", label: "Onde querem estar?", ajuda: "Instagram, Facebook, site, LinkedIn…", linhas: 2 },
      { id: "can_concorrentes", label: "Quem são os vossos principais concorrentes?", linhas: 2 },
    ],
  },
  {
    titulo: "Prático",
    icone: "⑧",
    campos: [
      { id: "prat_aprova", label: "Quem aprova o conteúdo?", linhas: 2 },
      { id: "prat_freq", label: "Com que frequência querem falar connosco?", linhas: 2 },
      { id: "prat_materiais", label: "Que materiais já têm?", ajuda: "fotos, catálogos, logótipos, vídeos…", linhas: 2 },
    ],
  },
  {
    titulo: "Ideias fora da caixa 💡",
    icone: "⑨",
    campos: [
      {
        id: "ideias_sonho",
        label: "O que gostavam MESMO de ter, mesmo que pareça impossível?",
        ajuda: "sonhem alto — nós vemos o que dá para fazer",
        sugerivel: true,
        linhas: 4,
      },
    ],
  },
];

const TODOS = SECOES.flatMap((s) => s.campos.map((c) => c.id));

export function GuiaForm({
  inicial,
  marca,
  cor,
  anexosIniciais = [],
  token,
}: {
  inicial: Record<string, string>;
  marca: { nome: string; setor: string; website: string };
  cor?: string;
  anexosIniciais?: Anexo[];
  token?: string;
}) {
  const acento = cor || "#E8A13C";
  const limpaInicial: Record<string, string> = {};
  for (const id of TODOS) if (typeof inicial[id] === "string") limpaInicial[id] = inicial[id];

  const [valores, setValores] = useState<Record<string, string>>(limpaInicial);
  const [estado, setEstado] = useState<"idle" | "guardar" | "guardado">("idle");
  const [aSugerir, setASugerir] = useState<Record<string, boolean>>({});
  const [sugestao, setSugestao] = useState<Record<string, string>>({});
  const [enviado, setEnviado] = useState<boolean>(Boolean(inicial._concluido));
  const [anexos, setAnexos] = useState<Anexo[]>(anexosIniciais);
  const [aCarregar, setACarregar] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function anexar(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    if (!files.length) return;
    setACarregar(true);
    for (const f of files) {
      const fd = new FormData();
      fd.append("ficheiro", f);
      const r = await anexarMaterialGuia(fd, token);
      if (r.ok && r.anexo) setAnexos((a) => [r.anexo as Anexo, ...a]);
    }
    setACarregar(false);
  }

  async function removerAnexo(id: string) {
    const r = await removerAnexoGuia(id, token);
    if (r.ok) setAnexos((a) => a.filter((x) => x.id !== id));
  }

  const preenchidos = useMemo(() => TODOS.filter((id) => (valores[id] || "").trim()).length, [valores]);
  const pct = Math.round((preenchidos / TODOS.length) * 100);

  function agendaGuardar(next: Record<string, string>) {
    setEstado("guardar");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      const r = await guardarGuia(next, token);
      setEstado(r.ok ? "guardado" : "idle");
    }, 900);
  }

  function mudar(id: string, v: string) {
    const next = { ...valores, [id]: v };
    setValores(next);
    agendaGuardar(next);
  }

  async function sugerir(campo: Campo) {
    setASugerir((s) => ({ ...s, [campo.id]: true }));
    try {
      const r = await fetch("/api/sede/guia-sugestao", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ label: campo.label, marca, respostas: valores, token }),
      });
      const d = await r.json();
      const s = (d?.sugestao || "").trim();
      if (!s) return;
      if (!(valores[campo.id] || "").trim()) {
        mudar(campo.id, s); // campo vazio → preenche já
      } else {
        setSugestao((x) => ({ ...x, [campo.id]: s })); // já tinha texto → mostra cartão
      }
    } catch {
      /* silêncio: o cliente escreve à vontade */
    } finally {
      setASugerir((s) => ({ ...s, [campo.id]: false }));
    }
  }

  function usarSugestao(id: string, modo: "sub" | "juntar") {
    const s = sugestao[id];
    if (!s) return;
    const atual = valores[id] || "";
    mudar(id, modo === "sub" ? s : (atual ? atual + "\n" + s : s));
    setSugestao((x) => ({ ...x, [id]: "" }));
  }

  async function enviar() {
    setEstado("guardar");
    const r = await concluirGuia(valores, token);
    setEstado(r.ok ? "guardado" : "idle");
    if (r.ok) setEnviado(true);
  }

  return (
    <div className="max-w-3xl pb-16">
      {/* cabeçalho */}
      <div className="rounded-2xl border border-line bg-cream p-5">
        <div className="font-mono text-[11px] uppercase tracking-widest" style={{ color: acento }}>
          Onboarding · {marca.nome}
        </div>
        <h1 className="mt-1 font-display text-3xl font-extrabold">O Guia da tua Marca</h1>
        <p className="mt-2 text-[15px] text-grey">
          Quanto melhor conhecermos a vossa marca, melhor comunicamos por ela. Responde ao teu ritmo —
          guarda-se sozinho. Preso numa pergunta? Carrega em <b style={{ color: acento }}>✨ Sugerir</b> e a
          nossa IA propõe uma resposta, que depois afinas. 🖐️
        </p>
        {/* progresso */}
        <div className="mt-4 flex items-center gap-3">
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-line">
            <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: acento }} />
          </div>
          <span className="font-mono text-xs text-grey">
            {preenchidos}/{TODOS.length}
          </span>
        </div>
        <div className="mt-2 h-4 font-mono text-[11px] text-grey">
          {estado === "guardar" ? "A guardar…" : estado === "guardado" ? "Guardado ✓" : ""}
        </div>
      </div>

      {/* secções */}
      {SECOES.map((sec) => (
        <section key={sec.titulo} className="mt-7">
          <h2 className="font-display text-xl font-extrabold">
            <span className="mr-2 text-grey">{sec.icone}</span>
            {sec.titulo}
          </h2>
          <div className="mt-3 space-y-4">
            {sec.campos.map((campo) => (
              <div key={campo.id}>
                <div className="mb-1 flex items-start justify-between gap-3">
                  <label htmlFor={campo.id} className="text-sm font-bold text-ink">
                    {campo.label}
                    {campo.ajuda ? <span className="ml-1 font-normal text-grey">— {campo.ajuda}</span> : null}
                  </label>
                  {campo.sugerivel ? (
                    <button
                      type="button"
                      onClick={() => sugerir(campo)}
                      disabled={aSugerir[campo.id]}
                      className="shrink-0 whitespace-nowrap rounded-full border px-3 py-1 text-xs font-bold transition disabled:opacity-50"
                      style={{ borderColor: acento, color: acento }}
                    >
                      {aSugerir[campo.id] ? "A pensar…" : "✨ Sugerir"}
                    </button>
                  ) : null}
                </div>
                <textarea
                  id={campo.id}
                  rows={campo.linhas ?? 3}
                  value={valores[campo.id] || ""}
                  onChange={(e) => mudar(campo.id, e.target.value)}
                  className="w-full resize-y rounded-xl border border-line bg-white px-3.5 py-2.5 text-[15px] leading-relaxed text-ink outline-none focus:border-ink"
                  placeholder="Escreve aqui…"
                />
                {sugestao[campo.id] ? (
                  <div className="mt-2 rounded-xl border border-line bg-cream p-3">
                    <div className="font-mono text-[10px] uppercase tracking-widest" style={{ color: acento }}>
                      Sugestão da IA
                    </div>
                    <p className="mt-1 text-sm text-ink">{sugestao[campo.id]}</p>
                    <div className="mt-2 flex gap-2">
                      <button
                        type="button"
                        onClick={() => usarSugestao(campo.id, "sub")}
                        className="rounded-full bg-ink px-3 py-1 text-xs font-bold text-cream"
                      >
                        Substituir
                      </button>
                      <button
                        type="button"
                        onClick={() => usarSugestao(campo.id, "juntar")}
                        className="rounded-full border border-line px-3 py-1 text-xs font-bold text-grey"
                      >
                        Juntar
                      </button>
                      <button
                        type="button"
                        onClick={() => setSugestao((x) => ({ ...x, [campo.id]: "" }))}
                        className="rounded-full px-3 py-1 text-xs font-bold text-grey"
                      >
                        Ignorar
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </section>
      ))}

      {/* anexos */}
      <section className="mt-9">
        <h2 className="font-display text-xl font-extrabold">
          <span className="mr-2 text-grey">📎</span>Materiais e anexos
        </h2>
        <p className="mt-1 text-sm text-grey">
          Junta tudo o que já tenham — logótipos, mockups, fichas técnicas, fotos, catálogos. Fica logo do nosso
          lado (e na Biblioteca). Até 25 MB por ficheiro.
        </p>
        <label
          className="mt-3 inline-flex cursor-pointer items-center gap-2 rounded-full px-5 py-2.5 text-sm font-bold text-cream"
          style={{ background: "#15181D", opacity: aCarregar ? 0.6 : 1 }}
        >
          {aCarregar ? "A carregar…" : "＋ Anexar ficheiros"}
          <input type="file" multiple className="hidden" onChange={anexar} disabled={aCarregar} />
        </label>
        {anexos.length ? (
          <ul className="mt-4 space-y-2">
            {anexos.map((a) => (
              <li
                key={a.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-line bg-cream px-3.5 py-2.5"
              >
                <span className="min-w-0 truncate text-sm text-ink">📄 {a.nome}</span>
                <button
                  type="button"
                  onClick={() => removerAnexo(a.id)}
                  className="shrink-0 text-xs font-bold text-grey hover:text-bad"
                >
                  remover
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-xs text-grey">Ainda sem anexos.</p>
        )}
      </section>

      {/* enviar */}
      <div className="mt-9 rounded-2xl border border-line bg-cream p-5">
        {enviado ? (
          <p className="text-[15px] text-ink">
            <b>Guia enviado à equipa. Obrigado! 🖐️</b> Podes continuar a afinar quando quiseres — guarda-se
            sozinho.
          </p>
        ) : (
          <>
            <p className="text-[15px] text-grey">
              Quando estiveres à vontade, envia-nos o guia. Não precisa de estar perfeito — afinamos juntos.
            </p>
            <button
              type="button"
              onClick={enviar}
              className="mt-3 rounded-full px-6 py-2.5 text-[15px] font-bold text-cream"
              style={{ background: "#15181D" }}
            >
              Enviar à equipa · dá cá cinco 🖐️
            </button>
          </>
        )}
      </div>
    </div>
  );
}
