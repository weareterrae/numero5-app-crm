import { rotulo, type Brief } from "@/lib/dominio/intake";

/**
 * Mostra ao comercial o brief profundo que o cliente preencheu — público,
 * tom, referências, site, automação, ambição. É a matéria-prima da proposta.
 */

function etiquetas(lista: string, chaves: string[] | undefined): string | null {
  if (!chaves?.length) return null;
  return chaves.map((k) => rotulo(lista, k)).filter(Boolean).join(" · ");
}

export function BriefCliente({ brief }: { brief: Brief | null | undefined }) {
  const b = brief ?? {};
  if (Object.keys(b).length === 0) return null;

  const seccoes: { titulo: string; linhas: [string, string | null][] }[] = [
    {
      titulo: "Quem quer alcançar",
      linhas: [
        ["Cliente ideal", rotulo("publico", b.publico)],
        ["Onde está", rotulo("onde", b.onde)],
        ["Idades", etiquetas("idades", b.idades)],
        ["Porque o escolhem", b.publico_texto ?? null],
      ],
    },
    {
      titulo: "Personalidade da marca",
      linhas: [
        ["Tom de voz", etiquetas("tom", b.tom)],
        ["Como quer que se sintam", b.sentir ?? null],
        ["Tratamento", rotulo("tratamento", b.tratamento)],
      ],
    },
    {
      titulo: "Inspiração & imagem",
      linhas: [
        ["Marcas que admira", b.referencias ?? null],
        ["O que gosta nelas", b.referencias_gosto ?? null],
        ["A evitar", b.evitar ?? null],
        ["Logótipo", rotulo("logo", b.logo)],
        ["Renovar imagem", rotulo("renovar", b.renovar)],
      ],
    },
    {
      titulo: "O site",
      linhas: [
        ["Estado atual", rotulo("site_estado", b.site_estado)],
        ["Site novo por nós", rotulo("site_novo", b.site_novo)],
        ["Tipo que imagina", etiquetas("site_tipo", b.site_tipo)],
        ["Tem de conseguir", b.site_funcoes ?? null],
      ],
    },
    {
      titulo: "Tecnologia & automação",
      linhas: [
        ["Quer automatizar", etiquetas("automacao", b.automacao)],
        ["Tarefa a tirar do prato", b.tarefa_chata ?? null],
      ],
    },
    {
      titulo: "Ambição",
      linhas: [
        ["Próximos 12 meses", b.ambicao ?? null],
        ["Para quando", rotulo("prazo", b.prazo)],
        ["Nota final", b.nota_final ?? null],
      ],
    },
  ]
    .map((s) => ({ ...s, linhas: s.linhas.filter(([, v]) => v) as [string, string][] }))
    .filter((s) => s.linhas.length > 0);

  if (seccoes.length === 0) return null;

  return (
    <div className="rounded-xl border-2 border-gold/40 bg-gold/[0.04] p-5">
      <p className="rotulo">o que o cliente sonha</p>
      <h2 className="mb-3 font-display text-lg font-extrabold">O brief, por palavras dele</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        {seccoes.map((s) => (
          <div key={s.titulo} className="rounded-lg border border-line bg-white p-4">
            <h3 className="mb-2 text-sm font-extrabold text-gold-dark">{s.titulo}</h3>
            <dl className="space-y-1.5">
              {s.linhas.map(([rot, val]) => (
                <div key={rot} className="text-sm">
                  <dt className="text-xs font-bold uppercase tracking-wide text-soft">{rot}</dt>
                  <dd className="text-grey">{val}</dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>
    </div>
  );
}
