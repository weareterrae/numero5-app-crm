export type Item = { href: string; label: string };
export type Grupo = { label: string; items: Item[] };
export type Entrada = Item | Grupo;

/** Fonte única da navegação do operador — usada pela barra desktop e pelo menu mobile. */
export const NAV: Entrada[] = [
  { href: "/", label: "Cockpit" },
  { href: "/dia", label: "O meu dia" },
  { href: "/producao", label: "Produção" },
  { href: "/radar", label: "Radar" },
  {
    label: "Comercial",
    items: [
      { href: "/clientes", label: "Clientes" },
      { href: "/clientes/funil", label: "Funil" },
      { href: "/guias", label: "Guias" },
      { href: "/leads", label: "Leads" },
      { href: "/leads/faturacao", label: "Assinaturas" },
      { href: "/avencas", label: "Avenças" },
    ],
  },
  {
    label: "Marketing",
    items: [
      { href: "/anuncios", label: "Anúncios" },
      { href: "/metricas", label: "Métricas" },
    ],
  },
  {
    label: "Financeiro",
    items: [
      { href: "/faturacao", label: "Faturação" },
      { href: "/capacidade", label: "Capacidade" },
      { href: "/definicoes/precos", label: "Preços" },
    ],
  },
  {
    label: "IA",
    items: [
      { href: "/ai-operations", label: "AI Operations" },
      { href: "/estado", label: "Estado dos Sistemas" },
    ],
  },
];

export const ehGrupo = (e: Entrada): e is Grupo => "items" in e;
