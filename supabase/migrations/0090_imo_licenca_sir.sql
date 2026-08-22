-- =====================================================================
-- 0090 · A licença do SIR, lida do contrato em vez de assumida
-- ---------------------------------------------------------------------
-- A migração 0087 pôs `saida_para_cliente = false` para o SIR com a nota
-- «as suas tabelas NÃO podem ser publicadas num relatório de cliente».
-- Era uma suposição prudente tomada sem ler o contrato — e está ERRADA.
--
-- Ficha de subscrição assinada a 25-06-2026 por Os Caetanos, Lda
-- (Terrae) com a IMOESTATÍSTICA, cláusula 4.d) das Condições Gerais:
--
--   «encontra-se incluído no preço do presente contrato a autorização
--    para usar, reproduzir parcialmente e divulgar os conteúdos […]
--    para fins próprios da actividade comercial da ENTIDADE SUBSCRITORA,
--    nomeadamente para ilustrar ou complementar apresentações aos seus
--    clientes ou potenciais clientes […] desde que em qualquer dos casos,
--    incluam, de forma visível em todas as reproduções a menção
--    «© IMOESTATÍSTICA – TODOS OS DIREITOS RESERVADOS».»
--
-- Ou seja: PODE aparecer no relatório do cliente. Com três limites, que
-- ficam aqui escritos porque um dia alguém vai construir o painel de
-- mercado e não vai ter o contrato à mão:
--
--   1. ATRIBUIÇÃO OBRIGATÓRIA, com estas palavras exatas, visível em
--      TODAS as reproduções. Não é uma nota de rodapé opcional.
--
--   2. SÓ AGREGADO. Cláusula 2.d): o que sai para terceiros «poderá
--      unicamente respeitar a resultados agregados a partir de todas as
--      entidades que integram a base de dados Ci-SIR». E 2.c): num
--      formato onde não seja possível reconstruir a operação individual
--      nem a visão sobre qualquer propriedade. Os nossos benchmarks já
--      são isso — medianas, quartis, price gap — e é preciso que
--      continuem a ser.
--
--   3. NÃO CONCORRER COM A FONTE. A autorização exclui o que «confluem
--      [sic] de nenhum modo com a normal exploração dos referidos
--      conteúdos ou constituam actos de concorrência desleal». Ilustrar
--      uma avaliação é o uso previsto; revender acesso aos dados não.
--
-- ÂMBITO GEOGRÁFICO (ficha, ponto 2): só a AML — Alcochete, Almada,
-- Amadora, Barreiro, Cascais, Lisboa, Loures, Mafra, Moita, Montijo,
-- Odivelas, Oeiras, Palmela, Seixal, Sesimbra, Setúbal, Sintra e Vila
-- Franca de Xira. Fora disto não há SIR, e o motor cai para o INE.
--
-- REDISTRIBUIÇÃO continua FALSA: publicar num relatório de cliente é uma
-- coisa; passar os dados a outrem para uso próprio é outra, e essa não
-- está autorizada.
-- =====================================================================

update imo_fontes set
  saida_para_cliente = true,
  redistribuicao = false,
  atribuicao_obrigatoria = '© IMOESTATÍSTICA – TODOS OS DIREITOS RESERVADOS',
  licenca = 'licenciado · Ficha de subscrição 25-06-2026, cláusula 4.d)',
  notas =
    'LICENCIADO à Os Caetanos, Lda (Terrae). Pode ser usado no cálculo E '
    'mostrado ao cliente, desde que: (1) a menção «© IMOESTATÍSTICA – '
    'TODOS OS DIREITOS RESERVADOS» apareça de forma visível em TODAS as '
    'reproduções; (2) só saiam valores AGREGADOS, de onde não se possa '
    'reconstruir uma operação nem uma propriedade individual; (3) o uso '
    'não concorra com a exploração normal do SIR. Âmbito: AML, 18 '
    'concelhos. Sem API — entra por importação de relatórios PDF.'
where id = 'sir';

-- ---------------------------------------------------------------------
-- E o sinal deixa de ser decorativo
-- ---------------------------------------------------------------------
-- `saida_para_cliente` e `atribuicao_obrigatoria` estavam declarados e
-- nenhum código os lia. Uma regra que ninguém consulta não é uma regra —
-- é um comentário com ar de regra, e o próximo a construir o painel de
-- mercado não a ia ver.
--
-- Esta função responde à pergunta que quem publica tem mesmo de fazer:
-- «posso mostrar isto, e o que tenho de escrever ao lado?»
create or replace function imo_pode_mostrar(p_fonte text)
returns table (pode boolean, atribuicao text, porque text)
language sql stable security definer set search_path = public as $$
  select
    f.saida_para_cliente,
    f.atribuicao_obrigatoria,
    case when f.saida_para_cliente
         then coalesce('Exige atribuição: ' || f.atribuicao_obrigatoria,
                       'Sem atribuição obrigatória.')
         else 'Esta fonte entra no cálculo mas não pode ser publicada.'
    end
  from imo_fontes f where f.id = p_fonte;
$$;

revoke all on function imo_pode_mostrar(text) from public, anon;
grant execute on function imo_pode_mostrar(text) to service_role, authenticated;

comment on function imo_pode_mostrar(text) is
  'Antes de pôr valores de uma fonte num relatório de cliente, perguntar '
  'aqui. Devolve se pode e que atribuição tem de acompanhar.';
