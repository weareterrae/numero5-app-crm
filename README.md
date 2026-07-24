# Nº 5 · App de negócio

CRM, diagnóstico e propostas do **Nº 5** — «o departamento de marketing das marcas que não têm um».

> **Fronteira:** esta aplicação é **só negócio**.
> A marca, o site público e o plano de comunicação vivem em `numerocinco.pt` (repo `numero5-site`).

## Stack

- **Next.js 16** (App Router) + **TypeScript** + **Tailwind CSS 4**
- **Supabase** — Postgres + Auth (magic link) + RLS
- Deploy: **Netlify**, em `app.numerocinco.pt`

> ⚠️ Next 16 mudou convenções: o antigo `middleware.ts` chama-se agora **`proxy.ts`**,
> e `cookies()` e `params` são **assíncronos**. A documentação da versão exata está
> em `node_modules/next/dist/docs/` — consultar antes de escrever código novo.

## Correr localmente

```bash
npm install
cp .env.example .env.local   # e preencher
npm run dev
```

Abre http://localhost:3000. Sem sessão, és encaminhado para `/login`.

### Variáveis de ambiente

| Variável | Onde encontrar | Para quê |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Settings → Data API → Project URL | ligar à base de dados |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Settings → API Keys → publishable/anon | acesso do browser (limitado por RLS) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API Keys → Legacy → `service_role` | **só servidor**; páginas públicas de partilha |
| `IA_PROVIDER` | — | `gemini` \| `openai` \| `anthropic` |
| `IA_MODELO` | — | ex.: `gemini-flash-latest` |
| `IA_API_KEY` | painel do fornecedor | redigir diagnósticos e propostas |

🔒 A `service_role` ignora o RLS. Nunca a expor no browser nem a commitar.

## Base de dados

As migrations estão em `supabase/migrations/`. Correr no **SQL Editor** do Supabase
(ou via Supabase CLI) pela ordem numérica:

```
0001_init.sql   # clientes, contactos, atividades, estado_historico,
                # diagnosticos, propostas, pacotes, avencas,
                # verificacoes_catalogo, profiles + triggers + RLS
```

Automatismos incluídos: proposta `enviada` → cliente em **Proposta**;
`aceite` → **Cliente** + cria a avença; `recusada` → **Perdido** com motivo.
Cada mudança de estado fica registada em `estado_historico` (é o que permite
calcular a taxa de conversão real).

## Organização

```
app/
  (app)/            área privada (exige sessão)
    page.tsx        Cockpit — funil, MRR, conversão, follow-ups
  login/            entrada por magic link
  auth/             callback e saída
  r/                páginas PÚBLICAS de partilha (relatório e proposta por token)
components/
  marca/Simbolo.tsx ⛔ o símbolo oficial — fonte ÚNICA, nunca redesenhar
lib/
  dominio/          lógica de negócio pura e testável (sem UI, sem BD)
    funil.ts        estados, transições, taxa de conversão
    metricas.ts     MRR, pipeline, formatação
  supabase/         clientes de browser e de servidor
proxy.ts            renovação de sessão + proteção de rotas (ex-middleware)
supabase/migrations/
```

**Princípio:** a lógica de negócio vive em `lib/dominio/` e não sabe que a UI existe.
As páginas leem dados e desenham; as regras estão fora delas.

## Marca

| Cor | Hex | Uso |
|---|---|---|
| Dourado | `#E8A13C` | cor de marca, realces, CTAs |
| Dourado escuro | `#B4761A` | links e rótulos sobre fundo claro |
| Tinta | `#15181D` | texto e fundos escuros |
| Creme | `#F5F4F0` | fundo |
| Cobalto | `#2B44E7` | **apenas números e dados** (classe `.numero`) |

⛔ **Regra dura:** o símbolo (4 traços + o 5.º na diagonal) é sempre o mesmo SVG,
servido por `<Simbolo/>`. Nunca redesenhar com CSS.

Tom: português de Portugal, tratamento por **tu**, divertido q.b., profissional sempre.
Nunca inventar dados, métricas, preços ou testemunhos.

## Estado

- [x] Fase A — schema, marca, autenticação, cockpit
- [x] Fase B — CRM (lista com filtros, funil kanban, ficha, contactos, atividades, follow-ups, avenças)
- [x] Fase C — Diagnóstico (11 verificações, scorecard, estado atual vs. pretendido, recomendações, relatório partilhável)
- [x] Fase D — Propostas (herda do diagnóstico, IA agnóstica ao fornecedor, páginas partilháveis, automatismos do funil)

## Por fazer

- Ligar a app a `app.numerocinco.pt` (site Netlify próprio) e desligar as ferramentas antigas
- SMTP próprio (Resend) no Supabase, para o magic link deixar de ter limite de envios
- Faturação/recibos (ficou deliberadamente de fora desta versão)
