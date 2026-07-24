/**
 * As verificações automáticas ao site do cliente.
 * Lógica pura: recebem o contexto já obtido e devolvem um resultado.
 * Não fazem pedidos de rede — quem vai buscar a página é a rota /api/analisar.
 *
 * Para acrescentar uma verificação: escreve-a aqui, junta-a a VERIFICACOES e
 * insere a linha correspondente em `verificacoes_catalogo` (título, peso, ordem).
 */

export type EstadoVerificacao = "ok" | "warn" | "bad";

export type Resultado = {
  codigo: string;
  estado: EstadoVerificacao;
  detalhe: string;
  dica?: string;
};

export type Contexto = {
  url: string;
  urlFinal: string;
  html: string;
  ms: number;
  status: number;
};

export type Verificacao = {
  codigo: string;
  titulo: string;
  correr: (ctx: Contexto) => Resultado;
};

// ---------- utilitários de leitura do HTML ----------
const tag = (html: string, re: RegExp): string | null => {
  const m = html.match(re);
  return m ? (m[1] ?? "").trim() : null;
};

const meta = (html: string, nome: string): string | null =>
  tag(html, new RegExp(`<meta[^>]+name=["']${nome}["'][^>]+content=["']([^"']*)["']`, "i")) ??
  tag(html, new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+name=["']${nome}["']`, "i"));

const propriedade = (html: string, prop: string): string | null =>
  tag(html, new RegExp(`<meta[^>]+property=["']${prop}["'][^>]+content=["']([^"']*)["']`, "i")) ??
  tag(html, new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+property=["']${prop}["']`, "i"));

// ---------- as verificações ----------

const https: Verificacao = {
  codigo: "https",
  titulo: "Ligação segura (HTTPS)",
  correr: ({ urlFinal }) =>
    urlFinal.startsWith("https://")
      ? { codigo: "https", estado: "ok", detalhe: "O site serve em HTTPS." }
      : {
          codigo: "https",
          estado: "bad",
          detalhe: "O site não está em HTTPS.",
          dica: "Sem cadeado, os browsers avisam a visita de que o site não é seguro.",
        },
};

const velocidade: Verificacao = {
  codigo: "velocidade",
  titulo: "Velocidade de resposta",
  correr: ({ ms }) => {
    if (ms < 800)
      return { codigo: "velocidade", estado: "ok", detalhe: `Respondeu em ${(ms / 1000).toFixed(1)}s.` };
    if (ms < 2500)
      return {
        codigo: "velocidade",
        estado: "warn",
        detalhe: `Respondeu em ${(ms / 1000).toFixed(1)}s.`,
        dica: "Acima de 1s começa a perder-se gente pelo caminho.",
      };
    return {
      codigo: "velocidade",
      estado: "bad",
      detalhe: `Demorou ${(ms / 1000).toFixed(1)}s a responder.`,
      dica: "Sites lentos perdem visitas antes sequer de aparecerem.",
    };
  },
};

const titulo: Verificacao = {
  codigo: "titulo",
  titulo: "Título da página",
  correr: ({ html }) => {
    const t = tag(html, /<title[^>]*>([\s\S]*?)<\/title>/i);
    if (!t)
      return {
        codigo: "titulo",
        estado: "bad",
        detalhe: "A página não tem título.",
        dica: "É o que aparece no Google e no separador do browser.",
      };
    if (t.length < 10 || t.length > 65)
      return {
        codigo: "titulo",
        estado: "warn",
        detalhe: `Título com ${t.length} caracteres.`,
        dica: "Entre 10 e 65 caracteres é o que o Google mostra sem cortar.",
      };
    return { codigo: "titulo", estado: "ok", detalhe: "Tem título descritivo." };
  },
};

const metaDesc: Verificacao = {
  codigo: "meta_desc",
  titulo: "Meta description",
  correr: ({ html }) => {
    const d = meta(html, "description");
    if (!d)
      return {
        codigo: "meta_desc",
        estado: "bad",
        detalhe: "Sem descrição para os resultados de pesquisa.",
        dica: "É o texto que convence alguém a clicar no Google.",
      };
    if (d.length < 50 || d.length > 165)
      return {
        codigo: "meta_desc",
        estado: "warn",
        detalhe: `Descrição com ${d.length} caracteres.`,
        dica: "Entre 50 e 165 caracteres aproveita o espaço todo.",
      };
    return { codigo: "meta_desc", estado: "ok", detalhe: "Tem descrição bem dimensionada." };
  },
};

const viewport: Verificacao = {
  codigo: "viewport",
  titulo: "Preparado para telemóvel",
  correr: ({ html }) =>
    meta(html, "viewport")
      ? { codigo: "viewport", estado: "ok", detalhe: "Declara viewport para ecrãs pequenos." }
      : {
          codigo: "viewport",
          estado: "bad",
          detalhe: "Não está preparado para telemóvel.",
          dica: "A maioria das visitas chega por telemóvel.",
        },
};

const h1: Verificacao = {
  codigo: "h1",
  titulo: "Título principal (H1)",
  correr: ({ html }) => {
    const todos = html.match(/<h1[^>]*>[\s\S]*?<\/h1>/gi) ?? [];
    if (todos.length === 0)
      return {
        codigo: "h1",
        estado: "bad",
        detalhe: "Não há H1 na página.",
        dica: "É a frase que diz, em 5 segundos, ao que o negócio vem.",
      };
    if (todos.length > 1)
      return {
        codigo: "h1",
        estado: "warn",
        detalhe: `Encontrei ${todos.length} H1.`,
        dica: "Um só H1 deixa claro qual é a mensagem principal.",
      };
    return { codigo: "h1", estado: "ok", detalhe: "Tem um H1 bem definido." };
  },
};

const openGraph: Verificacao = {
  codigo: "open_graph",
  titulo: "Partilha nas redes (Open Graph)",
  correr: ({ html }) => {
    const t = propriedade(html, "og:title");
    const img = propriedade(html, "og:image");
    if (t && img)
      return { codigo: "open_graph", estado: "ok", detalhe: "Partilhas saem com título e imagem." };
    if (t || img)
      return {
        codigo: "open_graph",
        estado: "warn",
        detalhe: "Open Graph incompleto.",
        dica: "Falta título ou imagem — as partilhas saem a meio gás.",
      };
    return {
      codigo: "open_graph",
      estado: "bad",
      detalhe: "Sem Open Graph.",
      dica: "Ao partilhar o link no WhatsApp ou Facebook, aparece feio e sem imagem.",
    };
  },
};

const altImagens: Verificacao = {
  codigo: "alt_imagens",
  titulo: "Texto alternativo nas imagens",
  correr: ({ html }) => {
    const imgs = html.match(/<img[^>]*>/gi) ?? [];
    if (imgs.length === 0)
      return { codigo: "alt_imagens", estado: "warn", detalhe: "Não encontrei imagens na página." };
    const comAlt = imgs.filter((i) => /alt=["'][^"']+["']/i.test(i)).length;
    const razao = comAlt / imgs.length;
    if (razao >= 0.9)
      return {
        codigo: "alt_imagens",
        estado: "ok",
        detalhe: `${comAlt} de ${imgs.length} imagens com texto alternativo.`,
      };
    if (razao >= 0.5)
      return {
        codigo: "alt_imagens",
        estado: "warn",
        detalhe: `Só ${comAlt} de ${imgs.length} imagens têm alt.`,
        dica: "O alt ajuda quem usa leitor de ecrã — e o Google a perceber as imagens.",
      };
    return {
      codigo: "alt_imagens",
      estado: "bad",
      detalhe: `Apenas ${comAlt} de ${imgs.length} imagens têm alt.`,
      dica: "Acessibilidade e SEO ficam ambos a perder.",
    };
  },
};

const contacto: Verificacao = {
  codigo: "contacto",
  titulo: "Contacto direto visível",
  correr: ({ html }) => {
    const tel = /href=["']tel:/i.test(html);
    const mail = /href=["']mailto:/i.test(html);
    if (tel || mail)
      return {
        codigo: "contacto",
        estado: "ok",
        detalhe: `Tem ${[tel && "telefone", mail && "email"].filter(Boolean).join(" e ")} clicável.`,
      };
    return {
      codigo: "contacto",
      estado: "bad",
      detalhe: "Sem telefone nem email clicáveis.",
      dica: "No telemóvel, um número clicável é a diferença entre uma chamada e um desistente.",
    };
  },
};

const formulario: Verificacao = {
  codigo: "formulario",
  titulo: "Formulário de contacto",
  correr: ({ html }) =>
    /<form[\s>]/i.test(html)
      ? { codigo: "formulario", estado: "ok", detalhe: "Existe formulário na página." }
      : {
          codigo: "formulario",
          estado: "warn",
          detalhe: "Não encontrei formulário nesta página.",
          dica: "Sem forma de deixar contacto, cada visita interessada perde-se.",
        },
};

const REDES_CONHECIDAS = [
  "instagram.com",
  "facebook.com",
  "linkedin.com",
  "youtube.com",
  "tiktok.com",
  "twitter.com",
  "x.com",
];

const redesLigadas: Verificacao = {
  codigo: "redes_ligadas",
  titulo: "Redes sociais ligadas",
  correr: ({ html }) => {
    const encontradas = REDES_CONHECIDAS.filter((d) => html.toLowerCase().includes(d));
    if (encontradas.length >= 2)
      return {
        codigo: "redes_ligadas",
        estado: "ok",
        detalhe: `Liga a ${encontradas.length} redes.`,
      };
    if (encontradas.length === 1)
      return {
        codigo: "redes_ligadas",
        estado: "warn",
        detalhe: "Só liga a uma rede social.",
        dica: "Quem gosta do site quer seguir a marca — facilita o caminho.",
      };
    return {
      codigo: "redes_ligadas",
      estado: "bad",
      detalhe: "O site não liga a nenhuma rede social.",
      dica: "O site e as redes deviam alimentar-se um ao outro.",
    };
  },
};

export const VERIFICACOES: Verificacao[] = [
  https,
  velocidade,
  titulo,
  metaDesc,
  viewport,
  h1,
  openGraph,
  altImagens,
  contacto,
  formulario,
  redesLigadas,
];

export function correrTodas(ctx: Contexto): Resultado[] {
  return VERIFICACOES.map((v) => {
    try {
      return v.correr(ctx);
    } catch {
      return { codigo: v.codigo, estado: "warn" as const, detalhe: "Não foi possível verificar." };
    }
  });
}
