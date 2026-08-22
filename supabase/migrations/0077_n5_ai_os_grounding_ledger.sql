-- =====================================================================
-- N5 AI OS · medir se o modelo PESQUISOU mesmo               [0077]
-- ---------------------------------------------------------------------
-- Descoberto ao testar o grounding a 22/08/2026: ter a ferramenta de
-- pesquisa disponível NÃO garante que o modelo a use — ele decide. Num
-- teste, a mesma pergunta sobre €/m² foi respondida DE MEMÓRIA mesmo com
-- google_search ligado; noutra pergunta (resultado de um jogo) pesquisou
-- e devolveu fontes.
--
-- Isto é o risco central dos diagnósticos da Terrae: uma resposta dada
-- de memória parece boa, soa confiante, e não tem fonte nenhuma. Sem
-- medir, ninguém nota. Com estas colunas dá para alertar sobre
-- "diagnóstico entregue sem ter pesquisado".
-- =====================================================================

alter table ai_requests
  add column if not exists grounding_pedido boolean not null default false,
  add column if not exists grounding_usado  boolean not null default false,
  add column if not exists grounding_fontes integer not null default 0;

comment on column ai_requests.grounding_pedido is
  'A classe pediu pesquisa web (tools: google_search).';
comment on column ai_requests.grounding_usado is
  'O modelo PESQUISOU mesmo (groundingMetadata na resposta). Pedido != usado.';
comment on column ai_requests.grounding_fontes is
  'Quantas fontes o modelo consultou. Zero com grounding_pedido=true é sinal de alerta.';

create index if not exists ai_requests_grounding_falhado
  on ai_requests (created_at desc)
  where grounding_pedido and not grounding_usado;

-- Vista de vigia: pedidos que deviam ter pesquisado e não pesquisaram.
create or replace view ai_grounding_falhado
with (security_invoker = true) as
select
  r.created_at, r.request_id, r.assistant_id, a.nome as assistente,
  r.provider_model_id, r.requested_class, r.grounding_fontes
from ai_requests r
left join ai_assistants a on a.id = r.assistant_id
where r.grounding_pedido and not r.grounding_usado
order by r.created_at desc;

comment on view ai_grounding_falhado is
  'Respostas entregues sem pesquisa apesar de a classe a exigir. Candidatas a revisão manual.';

insert into schema_migrations (version) values ('0077')
on conflict (version) do nothing;
