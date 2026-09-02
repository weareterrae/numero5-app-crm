-- =====================================================================
-- 0120 · funções imo_* de leitura e carga: só o service_role as executa
-- ---------------------------------------------------------------------
-- A revisão da 0119 apanhou isto: no Supabase, uma função criada em
-- public recebe EXECUTE para anon, authenticated e service_role pelos
-- default privileges, e «revoke ... from public, anon» não retira a
-- entrada explícita de authenticated. Confirmado em produção a 2 de
-- Setembro de 2026 (information_schema.routine_privileges): imo_benchmark,
-- imo_cp_area, imo_cp_fila, imo_cp_area_gravar, imo_cp_consulta,
-- imo_sir_micro_carregar, imo_geo_upsert, imo_amostra_valida e
-- imo_benchmark_oferta estavam executáveis por qualquer conta autenticada,
-- incluindo clientes externos da Sede (externo = true), que não passam em
-- n5_is_staff. Como são SECURITY DEFINER, as políticas RLS das tabelas
-- não travam nada: qualquer conta lia benchmarks SIR sem chave, sem
-- limite e sem atribuição, e podia escrever na fila do MicroSIR
-- (imo_cp_area) ou carregar benchmarks (imo_sir_micro_carregar).
--
-- Quem chama estas funções é sempre o service_role: as Edge Functions
-- imo-dados e imo-api, os scripts do portátil, e as rotas /api/imo da app
-- (que criam o cliente com SUPABASE_SERVICE_ROLE_KEY). Nada muda para eles.
--
-- Ficam como estavam, de propósito: imo_pode_mostrar e
-- imo_indicador_plausivel (concedidas a authenticated na 0090 e 0107) e as
-- funções IMMUTABLE puras (imo_chave, imo_faixa_area, imo_chave_amostra,
-- imo_qualidade_comparavel), que não leem nada.
-- =====================================================================

revoke all on function imo_benchmark(uuid, text, text, integer) from public, anon, authenticated;
revoke all on function imo_benchmark_oferta(uuid, text, text, integer) from public, anon, authenticated;
revoke all on function imo_amostra_valida(text) from public, anon, authenticated;
revoke all on function imo_geo_por_nome(text, text) from public, anon, authenticated;
revoke all on function imo_geo_upsert(uuid, text, text, numeric, numeric, boolean) from public, anon, authenticated;
revoke all on function imo_cp_area(text, numeric, numeric, uuid) from public, anon, authenticated;
revoke all on function imo_cp_fila(integer) from public, anon, authenticated;
revoke all on function imo_cp_area_gravar(jsonb) from public, anon, authenticated;
revoke all on function imo_cp_consulta(text) from public, anon, authenticated;
revoke all on function imo_sir_micro_carregar(jsonb) from public, anon, authenticated;

grant execute on function imo_benchmark(uuid, text, text, integer) to service_role;
grant execute on function imo_benchmark_oferta(uuid, text, text, integer) to service_role;
grant execute on function imo_amostra_valida(text) to service_role;
grant execute on function imo_geo_por_nome(text, text) to service_role;
grant execute on function imo_geo_upsert(uuid, text, text, numeric, numeric, boolean) to service_role;
grant execute on function imo_cp_area(text, numeric, numeric, uuid) to service_role;
grant execute on function imo_cp_fila(integer) to service_role;
grant execute on function imo_cp_area_gravar(jsonb) to service_role;
grant execute on function imo_cp_consulta(text) to service_role;
grant execute on function imo_sir_micro_carregar(jsonb) to service_role;

insert into schema_migrations (version) values ('0120')
on conflict (version) do nothing;
