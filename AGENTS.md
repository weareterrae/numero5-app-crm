<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

---

# numero5-app — o CRM/plataforma da agência Nº 5

A aplicação de negócio do Sandro (marca **Nº 5**, agência de marketing digital + IA, PT/Angola, operada por **Os Caetanos, Lda**, NIF 504428918). Vive em **app.numerocinco.pt**. É o cérebro que corre o funil todo: **atrair → diagnosticar → propor → produzir → planos → relatórios → faturar**.

> Ler também a **skill `numero5`** (sistema de marca: símbolo, cores, voz, regras duras) e a memória `agencia-marketing-digital.md` (diário do projeto, estado e histórico). Esta app é a ferramenta; a skill é a marca; a memória é o diário.

## Stack & deploy
- **Next.js 16** (App Router) + **React 19** + **Tailwind CSS 4** + **TypeScript**.
- Build: `npm run build` (= `next build --webpack`; Turbopack parte o empacotador de edge da Netlify). Typecheck rápido: `npx tsc --noEmit`.
- **Supabase** (Postgres + Auth magic-link/password + RLS). Projeto ref `rycgekqszxyudmchpqvs`.
- **Netlify** com **CI/CD por GitHub**: repo `weareterrae/numero5-app-crm` → push no `main` publica sozinho (site Netlify `numero5-app`, ID `1119aa78-af65-41cb-a58c-cb496b66a06e`). Não é preciso `netlify deploy` manual.
- **Resend** para email (auth do Supabase + envios da app).
- **IA agnóstica** (`lib/ia/provider.ts`): `IA_PROVIDER`=gemini|openai|anthropic, `IA_MODELO`, `IA_API_KEY`. O Sandro usa **Gemini** (Google AI Studio), não Anthropic. Gemini: `maxOutputTokens` generoso, filtrar `!thought`, `responseMimeType: application/json` para JSON.

## Variáveis de ambiente (Netlify)
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `IA_PROVIDER`/`IA_MODELO`/`IA_API_KEY`, `RESEND_API_KEY`, `EMAIL_REMETENTE` (defeito `Nº 5 <geral@numerocinco.pt>`), `EMAIL_REPLY_TO`, `DIGEST_EMAIL` (destino do digest da manhã).
⛔ Segredos põe-os o Sandro nos painéis — **nunca receber chaves no chat**.

## Modelo de dados (migrações `supabase/migrations/`)
`clientes` (funil, redes jsonb, intake_token, campos fiscais 0018, kit_* + onboarding jsonb 0020, metricool_blog_id 0016), `contactos` (departamento 0013), `atividades` (histórico + follow-ups), `diagnosticos` (site_score, objetivos, pedido jsonb, **brief jsonb** 0017 = intake profundo), `propostas` (escopo/escopo_pedido jsonb, setup_valor/avenca_valor, conteudo jsonb da IA, mostrar_comparacao, partilha_token), `pacotes`, `precos_unitarios` (catálogo parametrizável, categoria 0014), `casos` (portefólio, links 0010), `verificacoes_catalogo`, `estado_historico` (transições do funil), `avencas` (MRR; trigger cria/termina conforme estado 0012), `producao_itens` (folha de produção 0007), `planos` (0015, plano mensal HTML, aprovação do cliente), `relatorios` (0016, relatório mensal HTML), `cobrancas` (0019, faturação), `profiles`. Migrações 0001–0020.

RLS: política `authenticated → all` (só o operador entra). Páginas públicas usam **service role**.

## Mapa de rotas
- **Operador** `app/(app)/`: `/` cockpit (MRR, pipeline, conversão, follow-ups), `/clientes` (+ `/funil`, `/[id]` ficha, `/[id]/producao`, `/[id]/conteudo` = brief para o Claude Code, `/[id]/planos/[planoId]`, `/[id]/relatorios/[relatorioId]`), `/diagnosticos/[id]`, `/propostas/[id]` (Configurador + EditorTexto IA), `/avencas`, `/faturacao` (cobrança mensal), `/definicoes/precos`.
- **Público** (service role, sem sessão): `/r/proposta/[token]`, `/r/plano/[token]`, `/r/mes/[token]` (relatório mensal), `/r/relatorio/[token]` (raio-x do diagnóstico), `/intake/[token]` (diagnóstico profundo, wizard 8 passos), `/diagnostico` (formulário leve → cria lead), `/api/lead` (POST CORS: form do site numerocinco.pt cria lead), `/api/ia/*` (proposta, guia, chat, conteudo).

## Princípios de arquitetura (respeitar!)
1. **App = cérebro; Claude Code = motor.** O conteúdo e os relatórios PRODUZEM-SE no Claude Code (Metricool, pipeline visual, escrita forte). A app dá o **brief**, guarda, partilha e põe o cliente a aprovar. Não pôr geradores de conteúdo por IA na app (foi tentado e revertido).
2. **O Configurador é a única fonte do preço** (`components/propostas/Configurador.tsx` → `guardarEscopo`). Grava escopo/ambito/setup_valor/avenca_valor. `guardarProposta` NÃO toca em preços (só pacote/notas). Motor de cálculo: `lib/dominio/orcamento.ts` (`calcular`, `normalizarEscopo`, `descreverEscopo`).
3. **Financeiro coerente**: a página pública nunca mostra comparação sem avença nossa (`comparar = mostrar_comparacao && temPedido && nossoMensal > 0`). Aviso no admin antes de partilhar se faltar avença.
4. **Colunas recentes tolerantes**: campos de migrações novas (metricool, fiscais, kit, onboarding) vão num **update à parte** em `atualizarCliente` e são lidos numa **query tolerante** na ficha — se a migração ainda não correu, não parte as edições base.
5. **Páginas públicas** usam `criarClienteServico()` (service role). Segurança = token + validação. `/api/lead`: honeypot + anti-flood + dedup por email.
6. **Server actions** em ficheiros `acoes.ts` (`"use server"`), com helpers `texto()`/`numero()` e `revalidatePath`.
7. **O símbolo** só vem de `components/marca/Simbolo.tsx` (regra dura da marca — nunca redesenhar com CSS). Cores em tokens Tailwind: `gold #E8A13C`, `ink #15181D`, `cream #F5F4F0`, `cobalt #2B44E7` (SÓ números), + `line/grey/soft/good/bad/warn`. Fontes: `--font-display` (N5 Display), `--font-sans` (Archivo), `--font-mono`.
8. **Voz**: PT-PT (nunca Brasil), tratamento por «tu», caloroso; nunca inventar dados/métricas/preços; «números antes de adjetivos». Cada cliente tem um assistente de nome próprio único; o «Quinto» é do próprio Nº 5 e nunca se oferece ao cliente.

## Como trabalhar
- Verificar sempre `npx tsc --noEmit` antes de commitar.
- Commitar + `git push` → a Netlify publica sozinha (~1-2 min). Fechar commits com `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- Testar a base via script temporário na raiz do projeto (lê `.env.local`, usa `@supabase/supabase-js`), correr com `node ficheiro.mjs` e apagar a seguir.

## Pendências do Sandro (fora do código)
- **Correr no Supabase** as migrações que faltam: 0016, 0017, 0018, 0019, 0020.
- **Env** `DIGEST_EMAIL` no Netlify (para o digest da manhã).
- Confirmar **backups automáticos** do Supabase (plano).
- Por decidir: integração de **faturação certificada** (InvoiceXpress/Moloni/Vendus) vs. o tracker atual; motor de **captação de tráfego** para o próprio Nº 5.
