-- =====================================================================
-- 0091 · Os 18 concelhos que a licença do SIR cobre
-- ---------------------------------------------------------------------
-- A hierarquia tinha seis concelhos — os que a Terrae mais trabalha. Um
-- relatório de qualquer outro sítio da AML era recusado com «concelho
-- não existe na hierarquia», e o trabalho de o gerar perdia-se.
--
-- Aconteceu hoje: um relatório desenhado sobre Corroios devolveu
-- «Seixal», que não estava aqui, e não entrou.
--
-- A lista não é escolhida a gosto — é o ÂMBITO GEOGRÁFICO da ficha de
-- subscrição de 25-06-2026: «AML (Alcochete, Almada, Amadora, Barreiro,
-- Cascais, Lisboa, Loures, Mafra, Moita, Montijo, Odivelas, Oeiras,
-- Palmela, Seixal, Sesimbra, Setúbal, Sintra e Vila Franca de Xira)».
--
-- Fora destes 18 não há licença, e um relatório de fora deve mesmo ser
-- recusado. É por isso que a lista fica fechada e igual ao contrato: a
-- recusa passa a significar «isto está fora do que contratámos», que é
-- uma informação, e não «esqueci-me de acrescentar o concelho».
--
-- Mafra e Vila Franca de Xira pertencem ao distrito de Lisboa; os do sul
-- do Tejo ao de Setúbal. `imo_geo_upsert` é idempotente: correr isto
-- duas vezes não duplica nada.
-- =====================================================================

do $$
declare
  pt uuid; d_lisboa uuid; d_setubal uuid;
  nome text;
begin
  pt := imo_geo_upsert(null, 'pais', 'Portugal');
  d_lisboa  := imo_geo_upsert(pt, 'distrito', 'Lisboa');
  d_setubal := imo_geo_upsert(pt, 'distrito', 'Setúbal');

  foreach nome in array array[
    'Amadora', 'Cascais', 'Lisboa', 'Loures', 'Mafra',
    'Odivelas', 'Oeiras', 'Sintra', 'Vila Franca de Xira'
  ] loop
    perform imo_geo_upsert(d_lisboa, 'concelho', nome);
  end loop;

  foreach nome in array array[
    'Alcochete', 'Almada', 'Barreiro', 'Moita', 'Montijo',
    'Palmela', 'Seixal', 'Sesimbra', 'Setúbal'
  ] loop
    perform imo_geo_upsert(d_setubal, 'concelho', nome);
  end loop;
end $$;
