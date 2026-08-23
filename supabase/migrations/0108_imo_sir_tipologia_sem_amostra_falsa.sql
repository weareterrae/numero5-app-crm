-- =====================================================================
-- 0108 · As linhas de tipologia do SIR deixam de reclamar a amostra da zona
-- ---------------------------------------------------------------------
-- O `imo-importar-relatorio-sir.mjs` escreve `n_transacoes = R.amostra`
-- em TODAS as linhas do relatório — a geral e as seis de tipologia. Em
-- Carnaxide isso quer dizer que a linha das moradias T4 declara 9.720
-- transações, o mesmo número da zona inteira.
--
-- Não é uma questão de gosto. O comentário desta coluna diz:
--
--   «Quantas transações sustentam este número. Uma microzona com uma
--    transação NÃO tem mais autoridade do que um concelho com trezentas
--    — é este campo que impede essa inversão.»
--
-- Escrever 9.720 numa linha que se apoia em umas dezenas de vendas é
-- falso por essa definição, e tem uma consequência concreta: o
-- `imo_benchmark()` desempata por `n_transacoes desc`, por isso estas
-- linhas ganham SEMPRE às do MicroSIR — que trazem a contagem verdadeira
-- de cada tipologia (110 T1, 491 T2, 481 T3, 49 moradias T3…, somando os
-- 1.285 da zona).
--
-- Ou seja: a linha que reclama uma autoridade que não tem afasta a que
-- tem autoridade a sério.
--
-- ---------------------------------------------------------------------
-- PORQUE NULO E NÃO UM NÚMERO MELHOR
-- ---------------------------------------------------------------------
-- Podia estimar-se — repartir os 9.720 pelas tipologias na proporção do
-- MicroSIR, por exemplo. Seria inventar: o relatório em PDF NÃO publica
-- contagens por tipologia, e um número estimado numa coluna que existe
-- para medir autoridade é exatamente o tipo de coisa que ninguém
-- consegue defender seis meses depois.
--
-- `null` quer dizer «não sei», que é verdade. E tem o efeito certo: o
-- `imo_benchmark()` filtra por `coalesce(n_transacoes, 0) >= mínimo`, por
-- isso estas linhas saem da escolha automática e passam a servir só a
-- quem as for buscar de propósito. Os VALORES ficam todos — não se apaga
-- nada, remove-se uma afirmação.
--
-- A linha GERAL do SIR mantém a sua amostra: aí os 9.720 estão certos.
--
-- ---------------------------------------------------------------------
-- O QUE MUDA NAS AVALIAÇÕES
-- ---------------------------------------------------------------------
-- Nos seis concelhos com relatório em PDF, um imóvel com tipologia passa
-- a ser avaliado pela linha do MicroSIR daquela tipologia. Em Carnaxide,
-- um T3 desce de 4.771 para 4.394 €/m² — 8%.
--
-- Não se afirma que o número novo esteja mais certo: as geografias
-- diferem (o retângulo desenhado à mão do relatório contra a freguesia).
-- Afirma-se que a amostra que o sustenta é verdadeira, e a outra não.
-- =====================================================================

update imo_benchmarks set
  n_transacoes = null,
  extra = extra || jsonb_build_object(
    'n_transacoes_removido', n_transacoes,
    'n_transacoes_removido_porque',
      'era a amostra da zona inteira repetida em cada tipologia; o '
      'relatório SIR em PDF não publica contagens por tipologia'
  )
where fonte_id = 'sir'
  and tipologia <> ''
  and n_transacoes is not null;

-- E o importador deixa de o voltar a escrever. Corrigir os dados sem
-- corrigir quem os escreve é adiar o problema até à próxima importação —
-- foi o que aconteceu com o carregador do MicroSIR na 0103, e não se
-- repete.
--
-- Não há aqui código do importador para mudar (é um script Node), por
-- isso fica uma restrição que o impede: uma linha de tipologia do SIR com
-- amostra igual à da linha geral da mesma zona e período é recusada.
create or replace function imo_sir_amostra_por_tipologia()
returns trigger
language plpgsql as $$
declare v_geral int;
begin
  if new.fonte_id <> 'sir' or new.tipologia = '' or new.n_transacoes is null then
    return new;
  end if;

  select n_transacoes into v_geral
    from imo_benchmarks
   where fonte_id = new.fonte_id and geografia_id = new.geografia_id
     and tipo_imovel = '' and tipologia = '' and periodo = new.periodo;

  if v_geral is not null and v_geral = new.n_transacoes then
    raise warning
      'Linha de tipologia %/% com a amostra da zona inteira (%). Gravada com n_transacoes nulo.',
      new.tipo_imovel, new.tipologia, new.n_transacoes;
    new.extra := coalesce(new.extra, '{}'::jsonb) || jsonb_build_object(
      'n_transacoes_removido', new.n_transacoes,
      'n_transacoes_removido_porque', 'igual à amostra da linha geral da zona');
    new.n_transacoes := null;
  end if;

  return new;
end $$;

drop trigger if exists imo_sir_amostra_tipologia on imo_benchmarks;
create trigger imo_sir_amostra_tipologia
  before insert or update on imo_benchmarks
  for each row execute function imo_sir_amostra_por_tipologia();

comment on function imo_sir_amostra_por_tipologia() is
  'Impede que uma linha de tipologia do SIR declare a amostra da zona '
  'inteira. Um benchmark que reclama autoridade que não tem afasta o que '
  'a tem — e não dá erro nenhum a fazê-lo.';
