-- =====================================================================
-- 0085 — Nenhum modelo serve produção sem preço
-- ---------------------------------------------------------------------
-- Dois modelos estiveram ACTIVE sem preço no registo. Serviam pedidos e
-- registavam custo NULO. O painel mostrava-os a sair de graça — e um
-- número plausível não levanta suspeitas a ninguém.
--
-- Foi apanhado por acaso, ao escrever a reconciliação de custos. Não pode
-- depender de acaso: passa a ser impossível.
--
-- A regra tem uma válvula deliberada. Um modelo em piloto, ou um cujo
-- fornecedor ainda não publicou tabela, pode ser preciso antes de haver
-- preço. Nesse caso marca-se `preco_desconhecido_ok` COM justificação
-- escrita — o custo continua a ser registado a zero, mas a decisão fica
-- documentada e visível, em vez de ser um esquecimento silencioso.
-- =====================================================================

alter table ai_models
  add column if not exists preco_desconhecido_ok boolean not null default false,
  add column if not exists preco_desconhecido_motivo text;

comment on column ai_models.preco_desconhecido_ok is
  'Autoriza este modelo a servir produção sem preço no registo. Exige '
  'motivo escrito. O custo fica registado a ZERO — é uma decisão, não um '
  'esquecimento.';

alter table ai_models
  drop constraint if exists ai_models_preco_obrigatorio_ck;
alter table ai_models
  add constraint ai_models_preco_obrigatorio_ck
  check (
    status not in ('ACTIVE', 'DEGRADED')
    or (input_cost is not null and output_cost is not null)
    or (preco_desconhecido_ok and preco_desconhecido_motivo is not null
        and length(trim(preco_desconhecido_motivo)) >= 10)
  );

comment on constraint ai_models_preco_obrigatorio_ck on ai_models is
  'Um modelo ACTIVE ou DEGRADED tem de ter preço, ou uma justificação '
  'escrita para não ter. Sem isto, servia pedidos e registava custo nulo: '
  'o painel mostrava-o a sair de graça.';

-- Quem está a servir sem preço, e com que justificação.
create or replace view ai_modelos_sem_preco
with (security_invoker = true) as
select provider_model_id, provider_id, status,
       preco_desconhecido_ok, preco_desconhecido_motivo
from ai_models
where (input_cost is null or output_cost is null)
order by status, provider_model_id;

comment on view ai_modelos_sem_preco is
  'Modelos sem preço no registo. Os que estiverem ACTIVE têm de trazer '
  'justificação — a constraint garante-o.';
