-- 0025_condicoes_proposta.sql
-- Condições comerciais obrigatórias da proposta: validade, o que inclui/exclui,
-- prazo de arranque, política de revisões e forma de pagamento. Tornam a
-- proposta um documento fechado — nada fica implícito.

alter table propostas
  add column if not exists validade date;

alter table propostas
  add column if not exists condicoes jsonb not null default '{}'::jsonb;

comment on column propostas.validade is
  'Data até à qual a proposta é válida. Sem validade, a proposta não deve ser partilhada.';
comment on column propostas.condicoes is
  'Condições: { inclui, exclui, prazo_arranque, politica_revisoes, forma_pagamento }.';
