-- 0067_rls_staff_only.sql
-- Fecha a RLS das tabelas internas / da agência: só a equipa do Nº 5 (n5_is_staff) acede.
--
-- Porquê: o 0001 (e várias migrações seguintes) deixaram políticas
--   `for all to authenticated using (true) with check (true)`.
-- Como os clientes externos da Sede têm sessão Supabase real (profiles.externo=true),
-- com a anon-key + o JWT deles podiam consultar o PostgREST diretamente e ler dados
-- financeiros/margens de TODOS os clientes. O gate por redirect() no layout é só UI.
--
-- Seguro trancar: as páginas públicas (/r/**, /api/**) e a Sede leem estas tabelas por
-- SERVICE ROLE (criarClienteServico), que ignora a RLS. Os clientes externos só tocam
-- por JWT em orgs/org_membros/profiles/crm_* — já protegidas pelo 0046. Verificado no código.
--
-- Idempotente e tolerante a tabelas ainda não criadas (to_regclass).

-- 1) Tabelas internas / da agência → acesso total apenas para a equipa.
do $$
declare
  t text;
  tabelas_staff text[] := array[
    'clientes','contactos','atividades','diagnosticos','propostas','avencas',
    'pacotes','verificacoes_catalogo','conversas','precos_unitarios',
    'producao_itens','casos','planos','relatorios','cobrancas','configuracoes',
    'descontos','reunioes','aprovacoes','revisoes','proposta_versoes',
    'ordens_alteracao','biblioteca_conteudos','pedidos','materiais_cliente',
    'sede_resumos','marca_metricas','marca_comunicacao','metricool_agendados'
  ];
begin
  foreach t in array tabelas_staff loop
    if to_regclass('public.'||t) is not null then
      execute format('alter table %I enable row level security', t);
      execute format('drop policy if exists %I on %I', t||'_auth_all', t);
      execute format('drop policy if exists %I on %I', t||'_staff', t);
      execute format(
        'create policy %I on %I for all to authenticated using (n5_is_staff()) with check (n5_is_staff())',
        t||'_staff', t);
    end if;
  end loop;
end $$;

-- 2) Logs imutáveis: só INSERT + SELECT pela equipa. Sem UPDATE/DELETE
--    (a RLS nega por defeito o que não tem política) — um log adulterável não é auditoria.
--    Confirmado que nenhum código faz update/delete a estas tabelas.
do $$
declare t text;
begin
  foreach t in array array['auditoria','estado_historico'] loop
    if to_regclass('public.'||t) is not null then
      execute format('alter table %I enable row level security', t);
      execute format('drop policy if exists %I on %I', t||'_auth_all', t);
      execute format('drop policy if exists %I on %I', t||'_staff', t);
      execute format('drop policy if exists %I on %I', t||'_staff_insert', t);
      execute format('drop policy if exists %I on %I', t||'_staff_select', t);
      execute format('create policy %I on %I for insert to authenticated with check (n5_is_staff())', t||'_staff_insert', t);
      execute format('create policy %I on %I for select to authenticated using (n5_is_staff())', t||'_staff_select', t);
    end if;
  end loop;
end $$;

-- Nota: profiles fica intocado (o cliente externo precisa de ler a própria linha; o
-- n5_is_staff() é SECURITY DEFINER, não depende disto). storage.objects (materiais,
-- 0044) também fica fora — o modelo de acesso a ficheiros trata-se à parte para não
-- partir downloads do cliente.
