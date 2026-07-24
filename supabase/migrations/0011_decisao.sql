-- =====================================================================
-- Nº 5 · O cliente aceita ou recusa a proposta, com um comentário
--
-- Fecha o ciclo: sabemos que propostas foram aceites ou recusadas e
-- PORQUÊ. É a matéria-prima para melhorar as próximas.
-- (estado/decidida_em/motivo_recusa já existem da 0001.)
-- Correr no SQL Editor do Supabase. Seguro de correr novamente.
-- =====================================================================

alter table propostas
  add column if not exists nota_decisao text;
