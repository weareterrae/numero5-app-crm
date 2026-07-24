-- =====================================================================
-- Nº 5 · Gestão de anúncios: fixo OU percentagem da verba, o que for maior
--
-- Porquê: com verbas de PME (200-500 €/mês), 10% não paga o trabalho —
-- gerir 300 € dá quase o mesmo trabalho que gerir 3 000 €. E cobrar só
-- percentagem criaria um conflito de interesses (ganhar mais quando o
-- cliente GASTA mais, não quando o dinheiro RESULTA melhor), o que
-- contraria o posicionamento da casa.
-- Correr no SQL Editor do Supabase. Seguro de correr novamente.
-- =====================================================================

insert into precos_unitarios (chave, rotulo, descricao, tipo, unidade, ordem) values
  ('anuncios_pct', 'Anúncios — % da verba',
   'Percentagem cobrada quando ultrapassa o valor fixo de gestão. Escreve só o número (ex.: 10 para 10%).',
   'mensal', 'percentagem', 8)
on conflict (chave) do nothing;

update precos_unitarios
   set rotulo = 'Gestão de anúncios (mínimo)',
       descricao = 'Valor fixo de gestão: montar, acompanhar, otimizar e ler resultados. Cobra-se este OU a percentagem da verba — o que for maior. Os criativos pagam-se à parte, como peças.'
 where chave = 'anuncios';
