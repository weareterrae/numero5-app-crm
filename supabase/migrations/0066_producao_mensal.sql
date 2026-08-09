-- =====================================================================
-- Nº 5 · Produção mensal — quadro de contas + agendados do Metricool
--
-- Dá suporte a duas coisas novas:
--   1) O quadro /producao: saber, por conta, o estado do plano do mês e
--      quantos posts estão agendados (para não falhar o prazo de produzir).
--   2) O alerta que dispara 20 dias antes do fim do mês.
--
-- Nada aqui parte o que já existe. Seguro de correr de novo.
-- Correr no SQL Editor do Supabase.
-- =====================================================================

-- 1) Marca "esta conta tem plano mensal" (escolhes tu quais entram no quadro).
alter table clientes add column if not exists plano_mensal boolean not null default false;

-- 2) Marca manual de "já agendei este plano" (rede de segurança, caso não
--    queiras depender do Metricool para um mês específico).
alter table planos add column if not exists agendado_em timestamptz;

-- 3) Fotografia dos posts AGENDADOS no Metricool, por conta e por mês.
--    Preenchida pela sincronização (netlify/functions/sync-metricool.mjs),
--    tal como marca_metricas é preenchida pela recolha diária. A app só lê.
create table if not exists metricool_agendados (
  cliente_id    uuid not null references clientes(id) on delete cascade,
  mes           date not null,                 -- 1.º dia do mês (ex.: 2026-09-01)
  total         int  not null default 0,        -- posts planeados nesse mês (não-rascunho)
  pendentes     int  not null default 0,        -- ainda por publicar (status PENDING)
  publicados    int  not null default 0,        -- já publicados nesse mês
  por_rede      jsonb,                           -- {"instagram":8,"facebook":8,...}
  por_tipo      jsonb,                           -- {"post":6,"reel":2,"story":4,...}
  atualizado_em timestamptz not null default now(),
  primary key (cliente_id, mes)
);
create index if not exists metricool_agendados_mes_idx on metricool_agendados (mes);

alter table metricool_agendados enable row level security;
drop policy if exists metricool_agendados_auth_all on metricool_agendados;
create policy metricool_agendados_auth_all on metricool_agendados
  for all to authenticated using (true) with check (true);

-- ---------------------------------------------------------------------
-- (OPCIONAL) Ligar cada conta ao seu blog_id do Metricool, se ainda não
-- estiver. Confirma os nomes antes de correr — ajusta o lado direito do
-- ILIKE ao teu nome_marca real. Só toca em linhas com o blog_id ainda vazio.
-- ---------------------------------------------------------------------
-- update clientes set metricool_blog_id='6354824' where metricool_blog_id is null and nome_marca ilike '%terrae%';
-- update clientes set metricool_blog_id='6362422' where metricool_blog_id is null and nome_marca ilike '%quente%';
-- update clientes set metricool_blog_id='6368768' where metricool_blog_id is null and nome_marca ilike '%ekoology%';
-- update clientes set metricool_blog_id='6499555' where metricool_blog_id is null and nome_marca ilike '%minda%';
-- update clientes set metricool_blog_id='6505770' where metricool_blog_id is null and nome_marca ilike '%massa%';
-- update clientes set metricool_blog_id='6575712' where metricool_blog_id is null and nome_marca ilike '%santa maria%';
-- update clientes set metricool_blog_id='6664252' where metricool_blog_id is null and nome_marca ilike '%goreti%';
