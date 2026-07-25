-- 0039_pausa.sql
-- Fase 2, Prioridade 2 — Pausas de contrato. Um cliente pode pausar com regras
-- (duração máxima, fee mínimo, impacto na renovação). Sem pausas indefinidas em
-- silêncio: a pausa tem sempre uma data de fim.

alter table clientes
  add column if not exists pausa jsonb;

comment on column clientes.pausa is
  'Pausa em curso: { tipo, inicio, fim, fee_minimo, motivo, ativa }. tipo: contrato|producao|reducao. A pausa tem sempre fim.';
