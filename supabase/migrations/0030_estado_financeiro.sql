-- 0030_estado_financeiro.sql
-- Fase 2, Blocos 5+6 — Estado financeiro do cliente + pré-requisitos de arranque
-- da Fundação. A dívida (valor vencido, nº faturas) é DERIVADA de `cobrancas`,
-- não duplicada; aqui guardam-se só os campos de gestão.

alter table clientes
  add column if not exists financeiro jsonb not null default '{}'::jsonb;

alter table clientes
  add column if not exists arranque jsonb not null default '{}'::jsonb;

comment on column clientes.financeiro is
  'Gestão de cobrança: { estado, ultimo_contacto, proxima_acao, responsavel, excecao }. Estado: regular|pagamento_proximo|pagamento_atraso|aviso|producao_condicionada|producao_suspensa|acordo_especial.';
comment on column clientes.arranque is
  'Pré-requisitos da Fundação: { proposta_aceite, dados_fiscais, pagamento_inicial, acessos, briefing, desbloqueio_motivo }.';
