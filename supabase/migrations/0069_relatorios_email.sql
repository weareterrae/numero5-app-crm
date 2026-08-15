-- =====================================================================
-- Nº 5 · Relatórios mensais por email — aprovação + envio ao cliente
--
-- O relatório é produzido no Claude Code (motor). Depois:
--  1) o operador recebe um email de aprovação (o preview exato do que o
--     cliente vai receber), com um botão "Confirmar e enviar";
--  2) ao confirmar, sai ao cliente de giveme5@numerocinco.pt, com o
--     operador em CC, com o resumo no corpo + link para o relatório visual.
--
-- Colunas novas na tabela relatorios:
--   aprovar_token        — token secreto do link de aprovação (o operador)
--   email_html           — corpo do email pronto (versão segura p/ email, sem SVG)
--   aprovacao_enviada_em — quando o email de aprovação foi para o operador
--   aprovado_em          — quando o operador confirmou o envio ao cliente
--   email_cliente        — fotografia do destinatário no momento do envio
--
-- Correr no SQL Editor do Supabase. Seguro de correr novamente.
-- =====================================================================

alter table relatorios add column if not exists aprovar_token        uuid unique default gen_random_uuid();
alter table relatorios add column if not exists email_html           text;
alter table relatorios add column if not exists aprovacao_enviada_em timestamptz;
alter table relatorios add column if not exists aprovado_em          timestamptz;
alter table relatorios add column if not exists email_cliente        text;

-- Garante token nos relatórios que já existiam antes desta migração.
update relatorios set aprovar_token = gen_random_uuid() where aprovar_token is null;

insert into schema_migrations(version) values ('0069') on conflict do nothing;
