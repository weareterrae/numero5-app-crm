-- 0034_intake_rascunho.sql
-- Melhorar o diagnóstico — Fase 1: guardar e retomar. O cliente pode fechar o
-- separador e continuar exatamente onde parou. O rascunho vive na ficha do
-- cliente (tem o intake_token) e é substituído pelo diagnóstico final ao enviar.

alter table clientes
  add column if not exists intake_rascunho jsonb;

alter table clientes
  add column if not exists intake_passo integer not null default 0;

comment on column clientes.intake_rascunho is
  'Respostas do diagnóstico em curso (website, redes, objetivos, pedido, brief). Guardado a cada passo; limpo/ignorado após submissão.';
