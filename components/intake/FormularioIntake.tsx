"use client";

import { useState } from "react";
import { Simbolo } from "@/components/marca/Simbolo";
import { OBJETIVOS, type ChaveObjetivo } from "@/lib/dominio/diagnostico/recomendacoes";
import {
  AUTOMACAO,
  FAIXAS_ORCAMENTO,
  IDADES,
  LOGO,
  ONDE,
  PRAZO,
  PRESENCA,
  PUBLICO,
  RENOVAR,
  SITE_ESTADO,
  SITE_NOVO,
  SITE_TIPO,
  TOM,
  TRATAMENTO,
  type Brief,
} from "@/lib/dominio/intake";
import { CANAIS, ESCOPO_VAZIO, type ChaveCanal, type Escopo } from "@/lib/dominio/orcamento";
import { submeterIntake } from "@/app/intake/[token]/acoes";

const REDES_LINK: [string, string][] = [
  ["instagram", "Instagram"],
  ["facebook", "Facebook"],
  ["linkedin", "LinkedIn"],
  ["tiktok", "TikTok"],
  ["youtube", "YouTube"],
];

type Opcoes = readonly (readonly [string, string])[];

export function FormularioIntake({
  token,
  nome,
  setor,
  websiteInicial,
  redesIniciais,
  jaSubmetido,
}: {
  token: string;
  nome: string;
  setor: string | null;
  websiteInicial: string;
  redesIniciais: Record<string, string>;
  jaSubmetido: boolean;
}) {
  const [passo, setPasso] = useState(0);
  const [website, setWebsite] = useState(websiteInicial);
  const [redes, setRedes] = useState<Record<string, string>>(redesIniciais);
  const [temHoje, setTemHoje] = useState("");
  const [objetivos, setObjetivos] = useState<ChaveObjetivo[]>([]);
  const [objetivosTexto, setObjetivosTexto] = useState("");
  const [orcamento, setOrcamento] = useState("");
  const [pedido, setPedido] = useState<Escopo>({ ...ESCOPO_VAZIO });
  const [brief, setBrief] = useState<Brief>({});
  const [estado, setEstado] = useState<"a-preencher" | "a-enviar" | "enviado" | "erro">(
    "a-preencher",
  );
  const [erro, setErro] = useState("");

  // Atalhos para mexer no brief.
  const setB = (campo: keyof Brief, valor: unknown) => setBrief((b) => ({ ...b, [campo]: valor }));
  const um = (campo: keyof Brief, k: string) =>
    setBrief((b) => ({ ...b, [campo]: b[campo] === k ? undefined : k }));
  const varios = (campo: keyof Brief, k: string) =>
    setBrief((b) => {
      const arr = (b[campo] as string[] | undefined) ?? [];
      return { ...b, [campo]: arr.includes(k) ? arr.filter((x) => x !== k) : [...arr, k] };
    });

  function toggleObjetivo(k: ChaveObjetivo) {
    setObjetivos((o) => (o.includes(k) ? o.filter((x) => x !== k) : [...o, k]));
  }
  function toggleCanal(k: ChaveCanal) {
    setPedido((prev) => {
      const atual = prev.canais[k] ?? { ativo: false, proprio: false };
      return { ...prev, canais: { ...prev.canais, [k]: { ...atual, ativo: !atual.ativo } } };
    });
  }

  const semObjetivos = objetivos.length === 0 && !objetivosTexto.trim();

  async function enviar() {
    if (semObjetivos) {
      setPasso(2);
      setErro("Diz-nos pelo menos o que gostavas de alcançar. É a parte que mais nos ajuda. 🖐️");
      return;
    }
    setEstado("a-enviar");
    setErro("");
    const r = await submeterIntake({
      token,
      website,
      redes,
      temHoje,
      objetivos,
      objetivosTexto,
      pedido,
      orcamento,
      brief,
    });
    if (r.ok) setEstado("enviado");
    else {
      setErro(r.erro);
      setEstado("erro");
    }
  }

  if (estado === "enviado") {
    return (
      <main className="grid min-h-dvh place-items-center px-5">
        <div className="w-full max-w-md text-center">
          <Simbolo className="mx-auto mb-6 w-20" titulo="Nº 5" />
          <h1 className="font-display text-3xl font-extrabold">Recebido. Obrigado! 🖐️</h1>
          <p className="mt-3 text-grey">
            Já temos com que sonhar para o {nome}. Vamos preparar-te uma proposta à medida — falamos
            em breve.
          </p>
        </div>
      </main>
    );
  }

  // ── Passos ────────────────────────────────────────────────────────────
  const passos: { titulo: string; sub: string; corpo: React.ReactNode }[] = [
    {
      titulo: "A tua marca hoje",
      sub: "Só para percebermos o ponto de partida.",
      corpo: (
        <>
          <Campo label="O teu website (se tiveres)">
            <input
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              placeholder="https://…"
              className={CAMPO}
            />
          </Campo>
          <Campo label="Onde já andas nas redes (opcional)">
            <div className="grid gap-2 sm:grid-cols-2">
              {REDES_LINK.map(([k, nomeRede]) => (
                <input
                  key={k}
                  value={redes[k] ?? ""}
                  onChange={(e) => setRedes({ ...redes, [k]: e.target.value })}
                  placeholder={nomeRede}
                  className="rounded-lg border border-line px-3 py-2 text-sm"
                />
              ))}
            </div>
          </Campo>
          <Pergunta titulo="Como está a tua presença digital hoje?">
            <Chips opcoes={PRESENCA} ativo={(k) => brief.presenca === k} onSel={(k) => um("presenca", k)} />
          </Pergunta>
          <Campo label="O que já fazes hoje em marketing? (opcional)">
            <textarea
              value={temHoje}
              onChange={(e) => setTemHoje(e.target.value)}
              rows={2}
              placeholder="Ex.: publico quando me lembro, já tentei anúncios uma vez…"
              className={CAMPO}
            />
          </Campo>
        </>
      ),
    },
    {
      titulo: "Quem queres alcançar",
      sub: "Falar com toda a gente é falar com ninguém.",
      corpo: (
        <>
          <Pergunta titulo="Quem é o teu cliente ideal?">
            <Chips opcoes={PUBLICO} ativo={(k) => brief.publico === k} onSel={(k) => um("publico", k)} />
          </Pergunta>
          <Pergunta titulo="Onde é que ele está?">
            <Chips opcoes={ONDE} ativo={(k) => brief.onde === k} onSel={(k) => um("onde", k)} />
          </Pergunta>
          <Pergunta titulo="Que idades, mais ou menos?" nota="Podes escolher várias.">
            <Chips opcoes={IDADES} multi ativo={(k) => (brief.idades ?? []).includes(k)} onSel={(k) => varios("idades", k)} />
          </Pergunta>
          <Campo label="O que faz alguém escolher-te a ti e não ao vizinho?">
            <textarea
              value={brief.publico_texto ?? ""}
              onChange={(e) => setB("publico_texto", e.target.value)}
              rows={2}
              placeholder="Ex.: sou o único da zona que…, o meu atendimento é…"
              className={CAMPO}
            />
          </Campo>
        </>
      ),
    },
    {
      titulo: "O que gostavas de alcançar",
      sub: "A parte importante. Escolhe o que fizer sentido.",
      corpo: (
        <>
          <Pergunta titulo="Os teus objetivos" nota="Escolhe os que quiseres.">
            <Chips
              opcoes={OBJETIVOS}
              multi
              ativo={(k) => objetivos.includes(k as ChaveObjetivo)}
              onSel={(k) => toggleObjetivo(k as ChaveObjetivo)}
            />
          </Pergunta>
          <Campo label="Por tuas palavras: o que querias mesmo que acontecesse?">
            <textarea
              value={objetivosTexto}
              onChange={(e) => setObjetivosTexto(e.target.value)}
              rows={3}
              placeholder="Sonha um bocado. Daqui a um ano, o que mudou no negócio?"
              className={CAMPO}
            />
          </Campo>
        </>
      ),
    },
    {
      titulo: "A personalidade da tua marca",
      sub: "É isto que faz uma marca soar a gente e não a folheto.",
      corpo: (
        <>
          <Pergunta titulo="Se a tua marca fosse uma pessoa, como falaria?" nota="Escolhe as que encaixam.">
            <Chips opcoes={TOM} multi ativo={(k) => (brief.tom ?? []).includes(k)} onSel={(k) => varios("tom", k)} />
          </Pergunta>
          <Campo label="Como queres que as pessoas se sintam quando te veem?">
            <textarea
              value={brief.sentir ?? ""}
              onChange={(e) => setB("sentir", e.target.value)}
              rows={2}
              placeholder="Ex.: em confiança, com vontade de provar, que estão em boas mãos…"
              className={CAMPO}
            />
          </Campo>
          <Pergunta titulo="E tratas o cliente por…">
            <Chips opcoes={TRATAMENTO} ativo={(k) => brief.tratamento === k} onSel={(k) => um("tratamento", k)} />
          </Pergunta>
        </>
      ),
    },
    {
      titulo: "Inspiração & imagem",
      sub: "Mostra-nos o que te faz olhar duas vezes.",
      corpo: (
        <>
          <Campo label="Marcas ou páginas que admiras" nota="Não têm de ser do teu setor.">
            <textarea
              value={brief.referencias ?? ""}
              onChange={(e) => setB("referencias", e.target.value)}
              rows={2}
              placeholder="Nomes, @ ou links — o que te vier à cabeça."
              className={CAMPO}
            />
          </Campo>
          <Campo label="O que gostas nelas?">
            <textarea
              value={brief.referencias_gosto ?? ""}
              onChange={(e) => setB("referencias_gosto", e.target.value)}
              rows={2}
              placeholder="As cores, o à-vontade, a forma de mostrar os produtos…"
              className={CAMPO}
            />
          </Campo>
          <Campo label="Algo que NÃO queres parecer?">
            <textarea
              value={brief.evitar ?? ""}
              onChange={(e) => setB("evitar", e.target.value)}
              rows={2}
              placeholder="Ex.: nada de foleiro, nada demasiado sério…"
              className={CAMPO}
            />
          </Campo>
          <Pergunta titulo="O teu logótipo…">
            <Chips opcoes={LOGO} ativo={(k) => brief.logo === k} onSel={(k) => um("logo", k)} />
          </Pergunta>
          <Pergunta titulo="Apetece-te renovar a imagem?">
            <Chips opcoes={RENOVAR} ativo={(k) => brief.renovar === k} onSel={(k) => um("renovar", k)} />
          </Pergunta>
        </>
      ),
    },
    {
      titulo: "O teu site",
      sub: "A casa que é mesmo tua — não a rede social dos outros.",
      corpo: (
        <>
          <Pergunta titulo="Como está o teu site?">
            <Chips opcoes={SITE_ESTADO} ativo={(k) => brief.site_estado === k} onSel={(k) => um("site_estado", k)} />
          </Pergunta>
          <Pergunta titulo="Queres um site novo feito por nós?">
            <Chips opcoes={SITE_NOVO} ativo={(k) => brief.site_novo === k} onSel={(k) => um("site_novo", k)} />
          </Pergunta>
          <Pergunta titulo="Que tipo de site imaginas?" nota="Podes escolher mais do que um.">
            <Chips opcoes={SITE_TIPO} multi ativo={(k) => (brief.site_tipo ?? []).includes(k)} onSel={(k) => varios("site_tipo", k)} />
          </Pergunta>
          <Campo label="O que é que o site tem mesmo de conseguir fazer?">
            <textarea
              value={brief.site_funcoes ?? ""}
              onChange={(e) => setB("site_funcoes", e.target.value)}
              rows={2}
              placeholder="Ex.: receber marcações, vender online, mostrar o portefólio…"
              className={CAMPO}
            />
          </Campo>
        </>
      ),
    },
    {
      titulo: "Tecnologia & automação",
      sub: "A parte de sonhar: o que a tecnologia pode tratar por ti.",
      corpo: (
        <>
          <Pergunta titulo="O que gostavas de automatizar?" nota="Escolhe tudo o que te fizer sonhar.">
            <Chips opcoes={AUTOMACAO} multi ativo={(k) => (brief.automacao ?? []).includes(k)} onSel={(k) => varios("automacao", k)} />
          </Pergunta>
          <Campo label="Uma tarefa chata que adoravas tirar do teu prato?">
            <textarea
              value={brief.tarefa_chata ?? ""}
              onChange={(e) => setB("tarefa_chata", e.target.value)}
              rows={2}
              placeholder="Ex.: responder sempre às mesmas perguntas no WhatsApp…"
              className={CAMPO}
            />
          </Campo>
        </>
      ),
    },
    {
      titulo: "Ambição & investimento",
      sub: "Última passada. Depois é connosco.",
      corpo: (
        <>
          <Pergunta titulo="Em que redes gostavas de estar?" nota="Opcional.">
            <Chips
              opcoes={CANAIS}
              multi
              ativo={(k) => !!pedido.canais[k as ChaveCanal]?.ativo}
              onSel={(k) => toggleCanal(k as ChaveCanal)}
            />
          </Pergunta>
          <Pergunta titulo="Que investimento tens em mente?" nota="Opcional, e sem compromisso.">
            <Chips opcoes={FAIXAS_ORCAMENTO} ativo={(k) => orcamento === k} onSel={(k) => setOrcamento(orcamento === k ? "" : k)} />
          </Pergunta>
          <Campo label="A tua ambição para os próximos 12 meses">
            <textarea
              value={brief.ambicao ?? ""}
              onChange={(e) => setB("ambicao", e.target.value)}
              rows={2}
              placeholder="Onde queres estar daqui a um ano?"
              className={CAMPO}
            />
          </Campo>
          <Pergunta titulo="Para quando isto?">
            <Chips opcoes={PRAZO} ativo={(k) => brief.prazo === k} onSel={(k) => um("prazo", k)} />
          </Pergunta>
          <Campo label="Mais alguma coisa que queiras que saibamos?">
            <textarea
              value={brief.nota_final ?? ""}
              onChange={(e) => setB("nota_final", e.target.value)}
              rows={2}
              placeholder="O que quiseres. Estamos a ouvir. 🖐️"
              className={CAMPO}
            />
          </Campo>
        </>
      ),
    },
  ];

  const total = passos.length;
  const atual = passos[passo];
  const ultimo = passo === total - 1;

  function avancar() {
    if (passo === 2 && semObjetivos) {
      setErro("Escolhe pelo menos um objetivo (ou escreve por tuas palavras). É o que mais ajuda. 🖐️");
      return;
    }
    setErro("");
    setPasso((p) => Math.min(p + 1, total - 1));
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function voltar() {
    setErro("");
    setPasso((p) => Math.max(0, p - 1));
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <main className="mx-auto max-w-2xl px-5 py-8">
      {/* Cabeçalho */}
      <header className="rounded-2xl bg-ink px-7 py-7 text-cream">
        <Simbolo fundo="escuro" className="mb-4 w-12" titulo="Nº 5" />
        <p className="rotulo !text-gold">diagnóstico gratuito</p>
        <h1 className="mt-1.5 font-display text-2xl font-extrabold leading-tight sm:text-3xl">
          Vamos sonhar com o {nome}
        </h1>
        <p className="mt-2 text-[15px] text-soft">
          Umas perguntas rápidas — a maioria é só tocar. Quanto mais nos contas, mais à tua medida
          fica a proposta. 🖐️
        </p>
      </header>

      {jaSubmetido && passo === 0 && (
        <p className="mt-4 rounded-lg border border-gold bg-gold/10 p-3 text-sm">
          Já nos tinhas enviado isto — se preencheres outra vez, ficamos com a versão mais recente.
        </p>
      )}

      {/* Progresso */}
      <div className="mt-6 mb-4">
        <div className="mb-1.5 flex items-center justify-between text-xs font-bold text-grey">
          <span>
            Passo {passo + 1} de {total}
          </span>
          <span className="text-soft">{Math.round(((passo + 1) / total) * 100)}%</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-line">
          <div
            className="h-full rounded-full bg-gold transition-all duration-300"
            style={{ width: `${((passo + 1) / total) * 100}%` }}
          />
        </div>
      </div>

      {/* Passo atual */}
      <section className="rounded-xl border border-line bg-white p-5 sm:p-6">
        <h2 className="font-display text-xl font-extrabold">{atual.titulo}</h2>
        <p className="mb-4 mt-0.5 text-sm text-soft">{atual.sub}</p>
        <div className="space-y-5">{atual.corpo}</div>
      </section>

      {erro && <p className="mt-3 text-sm font-bold text-bad">{erro}</p>}

      {/* Navegação */}
      <div className="mt-5 flex items-center gap-3">
        {passo > 0 && (
          <button
            type="button"
            onClick={voltar}
            className="rounded-full border border-line px-5 py-3 text-sm font-bold text-grey hover:text-ink"
          >
            ← Voltar
          </button>
        )}
        <span className="flex-1" />
        {ultimo ? (
          <button
            type="button"
            onClick={enviar}
            disabled={estado === "a-enviar"}
            className="rounded-full bg-gold px-7 py-3 text-lg font-bold text-ink transition hover:brightness-105 disabled:opacity-60"
          >
            {estado === "a-enviar" ? "A enviar…" : "Enviar 🖐️"}
          </button>
        ) : (
          <button
            type="button"
            onClick={avancar}
            className="rounded-full bg-gold px-7 py-3 text-lg font-bold text-ink transition hover:brightness-105"
          >
            Continuar →
          </button>
        )}
      </div>

      <p className="mt-4 text-center text-xs text-soft">
        {setor ? `${setor} · ` : ""}Os teus dados servem só para prepararmos a tua proposta. Ver a{" "}
        <a
          href="https://numerocinco.pt/politica-de-privacidade/"
          target="_blank"
          rel="noopener"
          className="underline"
        >
          política de privacidade
        </a>
        .
      </p>
    </main>
  );
}

// ── Peças de UI ─────────────────────────────────────────────────────────
const CAMPO =
  "w-full rounded-lg border border-line bg-white px-3.5 py-2.5 text-[15px] outline-none focus:border-gold";

function chipClasse(on: boolean) {
  return `rounded-full border px-3.5 py-2 text-sm font-bold transition ${
    on ? "border-gold bg-gold text-ink" : "border-line bg-white text-grey hover:border-gold"
  }`;
}

function Chips({
  opcoes,
  ativo,
  onSel,
}: {
  opcoes: Opcoes;
  ativo: (k: string) => boolean;
  onSel: (k: string) => void;
  multi?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {opcoes.map(([k, r]) => (
        <button key={k} type="button" onClick={() => onSel(k)} className={chipClasse(ativo(k))}>
          {r}
        </button>
      ))}
    </div>
  );
}

function Pergunta({
  titulo,
  nota,
  children,
}: {
  titulo: string;
  nota?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="mb-2 text-sm font-bold text-ink">
        {titulo}
        {nota && <span className="ml-2 font-normal text-soft">{nota}</span>}
      </p>
      {children}
    </div>
  );
}

function Campo({
  label,
  nota,
  children,
}: {
  label: string;
  nota?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-bold text-ink">
        {label}
        {nota && <span className="ml-2 font-normal text-soft">{nota}</span>}
      </label>
      {children}
    </div>
  );
}
