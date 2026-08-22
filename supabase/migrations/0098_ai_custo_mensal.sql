-- =====================================================================
-- 0098 · Quanto custa cada assistente, por mês
-- ---------------------------------------------------------------------
-- Os tokens estavam registados desde o primeiro dia; o custo em dinheiro
-- é que nunca esteve. Para responder a «quanto me custa o Chef Kool este
-- mês?» era preciso cruzar `ai_requests` com `ai_models` à mão, e isso
-- quer dizer que ninguém o fazia.
--
-- O CUSTO CALCULA-SE AQUI, NÃO SE GUARDA
--
-- Guardar o custo em cada pedido parece mais simples e é uma armadilha:
-- os preços dos fornecedores mudam, e um custo gravado com o preço de
-- ontem passa a mentir sem que nada o diga. Calculado a partir do preço
-- corrente, um pedido antigo é reavaliado ao preço de hoje — o que é
-- honesto para «quanto gasto» e é o que interessa para decidir.
--
-- OS TOKENS EM CACHE CONTAM À PARTE. Custam uma fração (tipicamente 10%)
-- e são a maior alavanca de poupança que temos: um prompt de 30 mil
-- tokens repetido custa quase nada se for estável, e custa tudo se
-- mudar a cada pedido. Sem os separar, não se vê se o cache está a
-- trabalhar.
-- =====================================================================

create or replace view ai_custo_mensal as
with preco as (
  select provider_model_id,
         coalesce(input_cost, 0)                          as p_in,
         coalesce(cached_input_cost, input_cost, 0)       as p_cache,
         coalesce(output_cost, 0)                         as p_out,
         provider_id
    from ai_models
)
select
  date_trunc('month', r.created_at)::date          as mes,
  a.assistant_key,
  a.marca,
  p.provider_id                                    as fornecedor,
  count(*)                                         as pedidos,
  sum(r.input_tokens)                              as tokens_entrada,
  sum(r.cached_tokens)                             as tokens_cache,
  sum(r.output_tokens)                             as tokens_saida,
  -- Percentagem do que entrou que veio do cache. Abaixo de 50% num
  -- assistente de prompt grande é dinheiro a arder por prompt instável.
  case when sum(r.input_tokens) > 0
       then round(100.0 * sum(r.cached_tokens) / sum(r.input_tokens), 1)
       else null end                               as cache_pct,
  round(
    sum(
      (greatest(r.input_tokens - r.cached_tokens, 0) / 1e6) * p.p_in
      + (r.cached_tokens / 1e6) * p.p_cache
      + (r.output_tokens / 1e6) * p.p_out
    )::numeric, 4)                                 as usd
from ai_requests r
join ai_assistants a on a.id = r.assistant_id
join preco p on p.provider_model_id = r.provider_model_id
group by 1, 2, 3, 4;

comment on view ai_custo_mensal is
  'Custo por assistente e mês, aos preços CORRENTES dos modelos. '
  'Responde a «quanto me custou o Chef Kool em agosto» sem cruzar nada à mão.';

-- ---------------------------------------------------------------------
-- E o mesmo por MARCA, que é como se olha para o negócio
-- ---------------------------------------------------------------------
-- Uma marca pode ter vários assistentes — o do site, o da caixa de
-- entrada, o de relatórios. Quem paga a fatura quer o total da marca,
-- não a soma feita à mão de três linhas.
create or replace view ai_custo_marca_mensal as
select mes, coalesce(marca, 'sem marca') as marca,
       count(distinct assistant_key) as assistentes,
       sum(pedidos)                  as pedidos,
       sum(tokens_entrada + tokens_saida) as tokens,
       round(sum(usd), 4)            as usd
  from ai_custo_mensal
 group by 1, 2;

comment on view ai_custo_marca_mensal is
  'O mesmo, somado por marca. É esta a linha que vai para a decisão de '
  'quanto custa servir cada cliente.';

revoke all on ai_custo_mensal from anon;
revoke all on ai_custo_marca_mensal from anon;
grant select on ai_custo_mensal, ai_custo_marca_mensal to authenticated, service_role;
