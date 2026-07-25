-- 0038_portefolio.sql
-- Fase 2, Prioridade 2 — Autorizações de portefólio. Regra dura: nada entra no
-- portefólio sem autorização expressa do cliente. Consentimentos separados.

alter table clientes
  add column if not exists portefolio jsonb not null default '{}'::jsonb;

comment on column clientes.portefolio is
  'Autorizações separadas: { nome, logo, site, conteudos, metricas, caso, testemunho, aprovacao_previa }. Nada entra no portefólio sem autorização.';
