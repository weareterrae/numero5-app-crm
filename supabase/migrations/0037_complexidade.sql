-- 0037_complexidade.sql
-- Fase 2, Prioridade 2 — Complexidade do cliente. Nível definido pelo operador
-- (baixa|media|alta|personalizada), com sugestão calculada a partir de sinais.
-- Nunca aplica multiplicador de preço sozinho — é um alerta/decisão humana.

alter table clientes
  add column if not exists complexidade text;

comment on column clientes.complexidade is
  'Complexidade de gestão: baixa|media|alta|personalizada. Definida pelo operador; a plataforma só sugere.';
