/**
 * Casa o nome de uma freguesia como o SIR o escreve com a que já existe.
 *
 * O PROBLEMA, com um caso real
 *
 * O relatório do SIR diz «UF Algés e Linda-a-Velha». A freguesia chama-se
 * «União das Freguesias de Algés, Linda-a-Velha e Cruz Quebrada-Dafundo».
 * São a mesma coisa: o SIR abrevia e deixa cair membros.
 *
 * Sem casar os nomes, o import cria uma freguesia NOVA. E aí acontece o
 * pior que pode acontecer a dados: fica tudo verde. O import diz «✓ 7
 * benchmarks», a cobertura sobe, e as microzonas de Algés — que continuam
 * penduradas na freguesia oficial — nunca alcançam esse benchmark. Foi
 * exatamente o que aconteceu, e só se viu porque alguém foi ver à mão.
 *
 * Pior ainda: dois nomes que contêm «Algés» tornam a resolução por
 * `like '%algés%'` num sorteio. A instabilidade que se passou meses a
 * eliminar do cálculo voltava a entrar pela porta dos nomes.
 *
 * COMO CASA
 *
 * Não por semelhança de texto — «Alcabideche» e «Alcochete» são parecidos
 * e não têm nada a ver. Casa-se pelos LUGARES que o nome enumera: tira-se
 * o prefixo («UF», «União das Freguesias de»), parte-se por vírgulas e
 * por «e», e comparam-se os conjuntos. Um nome casa com o outro quando um
 * conjunto está contido no outro, porque abreviar é deixar cair membros,
 * nunca trocá-los.
 *
 * E QUANDO NÃO SABE, NÃO ADIVINHA
 *
 * Se dois candidatos casarem, devolve `ambigua` e o import pára naquele
 * ficheiro. Uma freguesia errada põe preços de Cascais numa casa de
 * Palmela — e, tal como aqui, não daria erro nenhum.
 */

export type Candidata = { id: string; nome: string };

export type Casamento =
  | { tipo: "exata" | "lugares"; id: string; nome: string }
  | { tipo: "ambigua"; nomes: string[] }
  | { tipo: "nenhuma" };

/** Sem acentos, minúsculas — a mesma normalização que a base de dados faz. */
export function chave(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

/**
 * Os lugares que um nome de freguesia enumera.
 *
 * «União das Freguesias de Algés, Linda-a-Velha e Cruz Quebrada-Dafundo»
 *   → ["alges", "linda-a-velha", "cruz quebrada-dafundo"]
 *
 * O «e» só separa quando é palavra inteira: «Cruz Quebrada-Dafundo» não
 * se parte, e «Sé» ou «Belém» também não.
 */
export function lugares(nome: string): string[] {
  const semPrefixo = chave(nome)
    // Os parênteses do SIR enumeram membros, não são um comentário:
    // «UF Sintra (S P Penaf., S Maria e S Miguel)». Valem como vírgulas.
    .replace(/[()]/g, ",")
    .replace(/^(uf|ufr)\s+/, "")
    .replace(/^uniao\s+(das|de)\s+freguesias\s+(de\s+)?/, "")
    .replace(/^freguesia\s+(de\s+)?/, "");

  return semPrefixo
    .split(/\s*,\s*|\s+e\s+/)
    .map((p) => p.trim().replace(/\.$/, ""))
    .filter(Boolean);
}

const contido = (a: string[], b: string[]) => a.every((x) => b.includes(x));

/**
 * @param nomeSIR nome como vem no relatório
 * @param candidatas freguesias que já existem NO MESMO CONCELHO — a
 *   restrição importa: sem ela, «Santo António» casaria em meia dúzia de
 *   concelhos ao mesmo tempo.
 */
export function casarFreguesia(nomeSIR: string, candidatas: Candidata[]): Casamento {
  const alvo = chave(nomeSIR);

  // Nome igual: não há nada a decidir.
  const exata = candidatas.find((c) => chave(c.nome) === alvo);
  if (exata) return { tipo: "exata", id: exata.id, nome: exata.nome };

  const meus = lugares(nomeSIR);
  if (!meus.length) return { tipo: "nenhuma" };

  // Em qualquer direção: o SIR tanto pode abreviar o nome oficial como
  // trazer a lista completa de uma freguesia que aqui está encurtada.
  const casam = candidatas.filter((c) => {
    const seus = lugares(c.nome);
    return seus.length > 0 && (contido(meus, seus) || contido(seus, meus));
  });

  if (casam.length === 1) return { tipo: "lugares", id: casam[0].id, nome: casam[0].nome };
  if (casam.length > 1) return { tipo: "ambigua", nomes: casam.map((c) => c.nome) };
  return { tipo: "nenhuma" };
}
