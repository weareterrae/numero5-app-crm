-- =====================================================================
-- 0092 · «Linda a Velha» tem de encontrar «Linda-a-Velha»
-- ---------------------------------------------------------------------
-- Ninguém escreve os hífenes dos topónimos portugueses. Quem preenche o
-- formulário escreve «Linda a Velha», «Cruz Quebrada Dafundo», «Vila
-- Franca de Xira» — e a `imo_chave` guardava o hífen, portanto:
--
--   "Linda-a-Velha"  ->  freguesia União das Freguesias de Algés…  ✓
--   "Linda a Velha"  ->  concelho Oeiras                            ✗
--
-- A segunda perdia o benchmark da freguesia e caía no concelho. Não dava
-- erro: a avaliação saía na mesma, com uma âncora mais fraca e uma banda
-- mais larga — e ninguém relacionava as duas coisas com um hífen.
--
-- Aconteceu num relatório real hoje: a amostra ficou guardada em «Oeiras»
-- em vez da freguesia de Linda-a-Velha.
--
-- O hífen passa a valer um espaço, e espaços seguidos colapsam. Assim
-- «Linda-a-Velha», «Linda a Velha» e «linda   a   velha» são a mesma
-- chave. Continua IMMUTABLE, que é o que permite usá-la em índices.
-- =====================================================================

create or replace function imo_chave(txt text)
returns text language sql immutable as $$
  select regexp_replace(
    trim(lower(translate(
      -- Hífen, meia-risca e travessão valem um espaço: é assim que a
      -- mesma povoação escrita de duas maneiras dá a mesma chave.
      translate(coalesce(txt, ''), '-–—', '   '),
      'áàâãäéèêëíìîïóòôõöúùûüñçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÑÇ',
      'aaaaaeeeeiiiiooooouuuuncAAAAAEEEEIIIIOOOOOUUUUNC'
    ))),
    '\s+', ' ', 'g'
  );
$$;

-- ---------------------------------------------------------------------
-- As chaves já gravadas têm de ser recalculadas
-- ---------------------------------------------------------------------
-- `nome_chave` é uma coluna gravada, não uma expressão do índice: mudar
-- a função não muda o que já lá está. Sem isto, a função nova procuraria
-- «linda a velha» contra linhas que continuam a dizer «linda-a-velha», e
-- a correção não corrigia nada — a pior espécie de migração, a que passa
-- e não faz efeito.
update imo_geografias set nome_chave = imo_chave(nome)
 where nome_chave is distinct from imo_chave(nome);

-- E se a normalização tiver aproximado duas linhas que agora colidem, o
-- índice único recusa e esta migração falha. É o comportamento certo:
-- duas geografias com a mesma chave são um problema para uma pessoa
-- resolver, não para uma migração escolher em silêncio qual sobrevive.
