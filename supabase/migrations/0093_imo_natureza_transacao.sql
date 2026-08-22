-- =====================================================================
-- 0093 · Nem tudo o que está em imo_transacoes é uma escritura
-- ---------------------------------------------------------------------
-- A tabela chama-se «transações» e o motor trata-a como tal: ancora nela
-- com até 50% do peso, porque é suposto ser a única coisa na base que
-- diz o que alguém PAGOU, e não o que alguém pediu.
--
-- Só que lá dentro estão três linhas e duas delas dizem, nas próprias
-- notas: «Preço de tabela (não escritura)». São preços de empreendimento
-- novo, usados como âncora de produto — legítimos como referência, e
-- exatamente a espécie de número que o motor existe para NÃO confundir
-- com uma escritura.
--
-- O efeito é silencioso e é o pior possível: uma avaliação em Quinta do
-- Anjo ancora num preço de tabela como se fosse uma venda fechada, e o
-- valor sobe sem que nada indique porquê. É a confusão pedido/escritura
-- a entrar pela porta dos dados, depois de a termos fechado no cálculo.
--
-- A distinção passa a estar na estrutura, não numa nota que ninguém lê:
--
--   escritura   preço de uma venda concluída. É o que ancora.
--   tabela      preço de lista de um promotor. Referência, não venda.
--   avaliacao   valor de uma avaliação formal. Nem uma coisa nem outra.
--
-- Por omissão «escritura», porque é o que a tabela sempre quis dizer e é
-- o que o formulário de registo grava.
-- =====================================================================

alter table imo_transacoes
  add column if not exists natureza text not null default 'escritura'
  check (natureza in ('escritura', 'tabela', 'avaliacao'));

comment on column imo_transacoes.natureza is
  'Que espécie de preço é este. Só «escritura» ancora o motor e só ela '
  'sai na exportação mensal para a IMOESTATÍSTICA — as outras são '
  'referências, não operações.';

-- As duas linhas que se declaram a si próprias. Não é inferência minha:
-- está escrito nas notas que alguém lá pôs.
update imo_transacoes set natureza = 'tabela'
 where fonte_id = 'terrae'
   and notas ilike '%tabela%'
   and notas ilike '%escritura%';

create index if not exists imo_transacoes_natureza
  on imo_transacoes (natureza, geografia_id);
