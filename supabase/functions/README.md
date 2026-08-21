# Edge Functions (Deno) — fora do TypeScript do Next

Este diretório é um projeto **Deno**, não Next.js. Por isso:

- os imports terminam em `.ts` (convenção Deno, obrigatória lá);
- está em `tsconfig.json → exclude`, senão o `tsc` do Next falha com
  `TS5097: An import path can only end with a '.ts' extension`;
- os testes (`*.test.ts`) continuam a correr no Vitest, que transpila
  sem se importar com a extensão.

Verificação de tipos destes ficheiros: `deno check supabase/functions/**`
(se o Deno estiver instalado). O Vitest e os testes de produção em
`scripts/` são a rede de segurança principal.

## Estrutura

- `_shared/n5-ai/` — o **core** do N5 AI OS. Só APIs Web: nenhum `Deno.*`,
  `process.*` ou `node:`. É esta regra que permite mudar de runtime
  (container, AWS, Workers) sem reescrever o produto.
- `ai-chat/` — o wrapper HTTP. A **única** peça que conhece o Deno.
- `ai-probe/` — monitorização sintética, corre em cron.
- `ai-descobrir/` — ferramenta de operação: pergunta ao fornecedor que
  modelos a conta tem mesmo, e mede-os. Existe para não voltarmos a
  assumir disponibilidade a partir de documentação desatualizada.
