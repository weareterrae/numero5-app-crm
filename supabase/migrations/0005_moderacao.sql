-- =====================================================================
-- Nº 5 · A moderação com aprovação humana passa a ter preço próprio
-- É o diferenciador da casa: ninguém fica sem resposta, e nada é
-- publicado sem alguém aprovar. Não pode ficar diluído noutra linha.
-- Correr no SQL Editor do Supabase. Seguro de correr novamente.
-- =====================================================================

insert into precos_unitarios (chave, rotulo, descricao, tipo, unidade, ordem) values
  ('moderacao', 'Respostas com aprovação',
   'Comentários, menções e mensagens no Facebook e Instagram: o assistente sugere a resposta no tom da marca e tu aprovas num clique antes de sair.',
   'mensal', 'fixo', 8),
  ('moderacao_setup', 'Instalar o sistema de respostas',
   'Ligar as páginas, treinar o assistente com o negócio e a voz da marca, e montar o circuito de aprovação.',
   'setup', 'fixo', 15)
on conflict (chave) do nothing;

-- Distinguir os dois assistentes: o do site e o das redes.
update precos_unitarios
   set rotulo = 'Assistente no site',
       descricao = 'Chat no site do cliente, com nome próprio e a informação do negócio.'
 where chave = 'assistente';

update precos_unitarios
   set rotulo = 'Criar o assistente do site',
       descricao = 'Assistente com nome próprio, à medida da marca do cliente.'
 where chave = 'assistente_setup';

-- Reordenar a parte mensal
update precos_unitarios set ordem = 7  where chave = 'anuncios';
update precos_unitarios set ordem = 8  where chave = 'moderacao';
update precos_unitarios set ordem = 9  where chave = 'assistente';
update precos_unitarios set ordem = 10 where chave = 'relatorio';
