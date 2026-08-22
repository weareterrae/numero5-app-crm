-- =====================================================================
-- 0084 — Contar as fontes que o formatter tentou inventar
-- ---------------------------------------------------------------------
-- O passo de formatar recebe a lista das fontes REAIS e a ordem de não
-- acrescentar nenhuma. Isso é uma instrução, e instruções cumprem-se quase
-- sempre. «Quase» não chega num relatório que diz a alguém quanto vale a
-- casa dele — já se viu acrescentar «INE» e «primeimobiliaria» a uma lista
-- que não os continha.
--
-- O gateway passou a podar deterministicamente o que não veio da pesquisa.
-- Esta coluna guarda quantas foram removidas.
--
-- Zero é o normal. Um número que sobe é sinal de que o modelo deixou de
-- respeitar a lista — e vê-se aqui antes de se ver num relatório entregue.
-- =====================================================================

alter table ai_requests
  add column if not exists fontes_removidas smallint not null default 0;

comment on column ai_requests.fontes_removidas is
  'Fontes que o passo de formatar acrescentou e que a pesquisa não devolveu. '
  'Foram removidas antes de a resposta sair. Zero é o esperado.';

-- Onde isto está a acontecer, e com que frequência.
create or replace view ai_fontes_inventadas
with (security_invoker = true) as
select
  a.assistant_key,
  r.provider_model_id,
  count(*)                                   as relatorios,
  sum(r.fontes_removidas)                    as fontes_removidas,
  round(avg(r.fontes_removidas)::numeric, 2) as media_por_relatorio,
  max(r.created_at)                          as ultima
from ai_requests r
join ai_assistants a on a.id = r.assistant_id
where r.fontes_removidas > 0
  and r.created_at > now() - interval '30 days'
group by a.assistant_key, r.provider_model_id
order by sum(r.fontes_removidas) desc;

comment on view ai_fontes_inventadas is
  'Onde o formatter tenta acrescentar fontes que não existem. Se um modelo '
  'aparecer aqui com frequência, não é candidato a escrever relatórios.';
