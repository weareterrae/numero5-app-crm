-- =====================================================================
-- 0117 — permissões do schema `produto`
-- ---------------------------------------------------------------------
-- Um schema criado à mão não herda as concessões que a Supabase dá
-- automaticamente ao `public` — por isso a API respondia
-- "permission denied for schema produto" mesmo depois de o expor nas
-- definições. Faltava dizer aos papéis (roles) que a API usa que podem
-- lá entrar.
--
-- `alter default privileges` cobre as tabelas que ainda não existem —
-- sem isto, cada tabela nova dentro de `produto` precisava desta
-- concessão outra vez, à mão.
-- =====================================================================

grant usage on schema produto to anon, authenticated, service_role;

grant all on all tables in schema produto to service_role;
grant select on all tables in schema produto to authenticated;

alter default privileges in schema produto
  grant all on tables to service_role;
alter default privileges in schema produto
  grant select on tables to authenticated;
