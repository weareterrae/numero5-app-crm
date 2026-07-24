-- =====================================================================
-- Nº 5 · Canais adicionais têm gestão reduzida
-- O conteúdo produz-se UMA vez e adapta-se; o que cresce é a gestão.
-- Correr no SQL Editor do Supabase. Seguro de correr novamente.
-- =====================================================================

insert into precos_unitarios (chave, rotulo, descricao, tipo, unidade, ordem) values
  ('gestao_canal_extra', 'Gestão de canal adicional',
   'Cada rede além da primeira: adaptar formatos e responder. Não é reproduzir o trabalho.',
   'mensal', 'canal', 6)
on conflict (chave) do nothing;

-- Reordenar para o extra ficar logo a seguir ao canal principal
update precos_unitarios set ordem = 6  where chave = 'gestao_canal_extra';
update precos_unitarios set ordem = 7  where chave = 'anuncios';
update precos_unitarios set ordem = 8  where chave = 'assistente';
update precos_unitarios set ordem = 9  where chave = 'relatorio';

-- Clarificar que a produção é por peça ÚNICA
update precos_unitarios
   set descricao = 'Peça estática: conceito, arte e copy. Conta-se UMA vez, mesmo que saia em vários canais.'
 where chave = 'post';
update precos_unitarios
   set descricao = 'Várias páginas: mais conceito e mais produção. Conta-se uma vez.'
 where chave = 'carrossel';
update precos_unitarios
   set descricao = 'Guião, edição, legendas e som. Conta-se uma vez.'
 where chave = 'reel';
update precos_unitarios
   set descricao = 'Peça de story. Conta-se uma vez.'
 where chave = 'story';
update precos_unitarios
   set rotulo = 'Gestão do 1.º canal'
 where chave = 'gestao_canal';
