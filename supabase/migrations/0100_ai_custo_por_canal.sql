-- =====================================================================
-- 0100 · Por marca, por mês, e por onde a conversa entrou
-- ---------------------------------------------------------------------
-- «Quanto me custa a KoolNature» já se respondia. O que faltava era a
-- pergunta seguinte, que é a que leva a uma decisão: veio do site ou do
-- Instagram?
--
-- Sem essa separação, um total de $3 não diz se são mil conversas no
-- chat do site ou trinta mensagens numa caixa de entrada — e são
-- problemas opostos. O primeiro é sucesso a custar dinheiro; o segundo é
-- caro por mensagem e merece olhos.
--
-- O CANAL LÊ-SE DA CHAVE. Os bots de Facebook e Instagram chamam-se
-- todos `social-*`; o resto é site ou app. É uma convenção, e as
-- convenções partem-se — por isso está aqui, num sítio só, e não
-- espalhada por consultas.
-- =====================================================================

create or replace view ai_custo_canal_mensal as
select
  mes,
  coalesce(marca, 'sem marca') as marca,
  case when assistant_key like 'social-%' then 'Instagram/Facebook'
       else 'Site e app' end   as canal,
  count(distinct assistant_key) as assistentes,
  sum(pedidos)                  as pedidos,
  sum(tokens_entrada + tokens_saida) as tokens,
  round(sum(usd), 4)            as usd
from ai_custo_mensal
group by 1, 2, 3;

comment on view ai_custo_canal_mensal is
  'Custo por marca, mês e canal. Responde a «a KoolNature custou-me isto, '
  'e foi no site ou no Instagram?» — que é a pergunta que leva a decidir.';

-- ---------------------------------------------------------------------
-- O RESUMO DO MÊS, numa linha por marca
-- ---------------------------------------------------------------------
-- É esta a vista que se abre no fim do mês. Traz os dois canais lado a
-- lado, para não ser preciso somar nada de cabeça.
--
-- Traz também o mês ANTERIOR da mesma marca. Um custo isolado não diz
-- nada: $3 é muito ou pouco conforme o que foi no mês passado, e é a
-- variação que faz alguém olhar.
create or replace view ai_resumo_mensal_marca as
with base as (
  select mes, marca,
         sum(usd) filter (where canal = 'Site e app')          as usd_site,
         sum(usd) filter (where canal = 'Instagram/Facebook')  as usd_social,
         sum(pedidos) filter (where canal = 'Site e app')      as ped_site,
         sum(pedidos) filter (where canal = 'Instagram/Facebook') as ped_social,
         sum(usd) as usd_total, sum(pedidos) as pedidos
    from ai_custo_canal_mensal
   group by 1, 2
)
select
  b.mes, b.marca,
  coalesce(b.usd_site, 0)   as usd_site,
  coalesce(b.usd_social, 0) as usd_social,
  b.usd_total,
  coalesce(b.ped_site, 0)   as pedidos_site,
  coalesce(b.ped_social, 0) as pedidos_social,
  b.pedidos,
  -- Quanto custa, em média, cada conversa desta marca. É o número que
  -- se compara entre marcas: um total alto com muitos pedidos é uso;
  -- um total alto com poucos é desperdício.
  case when b.pedidos > 0 then round((b.usd_total / b.pedidos)::numeric, 5) end as usd_por_pedido,
  a.usd_total as usd_mes_anterior,
  case when a.usd_total > 0
       then round((100 * (b.usd_total - a.usd_total) / a.usd_total)::numeric, 1)
  end as variacao_pct
from base b
left join base a
  on a.marca = b.marca
 and a.mes = (b.mes - interval '1 month')::date;

comment on view ai_resumo_mensal_marca is
  'O fecho do mês: uma linha por marca, com site e redes separados, o '
  'custo médio por conversa, e a variação face ao mês anterior. Um custo '
  'isolado não diz nada — é a variação que faz alguém olhar.';

revoke all on ai_custo_canal_mensal, ai_resumo_mensal_marca from anon;
grant select on ai_custo_canal_mensal, ai_resumo_mensal_marca to authenticated, service_role;
