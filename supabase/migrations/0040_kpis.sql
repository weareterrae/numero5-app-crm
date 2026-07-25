-- 0040_kpis.sql
-- Fase 2, Prioridade 2 — Objetivos e KPIs do período. Até 3 objetivos por
-- cliente, cada um com o seu KPI. Nunca obrigar a metas quando não há histórico.

alter table clientes
  add column if not exists kpis jsonb not null default '[]'::jsonb;

comment on column clientes.kpis is
  'Objetivos/KPIs do período: [{ objetivo, kpi, valor_inicial, meta, fonte, resultado, comentario }]. Máx. 3. Meta opcional.';
