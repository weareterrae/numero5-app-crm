-- 0024_custos_externos.sql
-- Custos externos por serviço (licenças, stock, fornecedores) que entram no
-- custo interno e puxam a margem para baixo — para o preço refletir a verdade.
-- Junta ainda os limiares de margem ao semáforo de rentabilidade.

alter table precos_unitarios
  add column if not exists custo_externo numeric;

comment on column precos_unitarios.custo_externo is
  'Custos externos por unidade (licenças, stock fotográfico, fornecedores). Somam ao custo interno no cálculo da margem.';

insert into configuracoes (chave, valor, descricao) values
  ('limiar_amarelo_margem', '40', 'Abaixo desta margem (%) a proposta fica amarela.'),
  ('limiar_vermelho_margem', '25', 'Abaixo desta margem (%) a proposta fica vermelha.')
on conflict (chave) do nothing;
