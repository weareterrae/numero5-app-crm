-- =====================================================================
-- 0101 · MicroSIR — as 124 freguesias da AML e o carregador dos percentis
-- ---------------------------------------------------------------------
-- O que isto traz: €/m² por FREGUESIA para toda a Área Metropolitana de
-- Lisboa, colhido do MicroSIR pela conta subscrita. Até hoje o motor
-- tinha o INE ao nível do concelho e os relatórios SIR em PDF de seis
-- concelhos. Agora tem 142 zonas com amostras na ordem dos milhares:
-- Carnaxide passa de 55 observações para 1 285, Avenidas Novas tem 4 243.
--
-- É evidência, não um algoritmo melhor — e é evidência que aperta a banda
-- entre mínimo e máximo, que é o que se queria.
--
-- ---------------------------------------------------------------------
-- A DECISÃO QUE MAIS IMPORTA AQUI: ISTO É OFERTA, NÃO ESCRITURA
-- ---------------------------------------------------------------------
-- Os percentis do MicroSIR são preços PEDIDOS. A fonte `sir` que já
-- existe é `tipo = 'transacao', escalao = 1` porque os relatórios em PDF
-- trazem valores de escritura E o price gap. Estes números não são a
-- mesma coisa.
--
-- Pô-los no escalão 1 faria o `imo_benchmark()` escolhê-los à frente das
-- transações — e ainda por cima ganhavam o desempate, porque ordena por
-- `n_transacoes desc` e uma freguesia tem milhares de anúncios contra
-- centenas de escrituras. O resultado seria o motor a tratar preços
-- pedidos como preços fechados e a SOBREVALORIZAR toda a AML, sem um
-- único erro no log.
--
-- Por isso entram como fonte própria, `tipo = 'oferta', escalao = 2` — a
-- gaveta que o schema já tinha para isto. O `ancoraSIR()` do motor é
-- precisamente a função que converte oferta em escritura aplicando o
-- price gap; é ela que os há de usar.
--
-- SE SE CONFIRMAR que o MicroSIR publica escrituras e não anúncios, muda-
-- se `tipo` e `escalao` desta fonte numa linha. O caminho conservador é
-- recuperável; o outro não: teria valorizado casas a mais durante meses
-- antes de alguém reparar.
--
-- ---------------------------------------------------------------------
-- O QUE NÃO SE INVENTA
-- ---------------------------------------------------------------------
-- O MicroSIR devolve P25, MÉDIA e P75 — não devolve mediana. O
-- `eur_m2_mediano` fica NULO, e não se lá põe a média a fingir: numa
-- distribuição de preços a média é puxada para cima pela cauda de luxo, e
-- gravá-la numa coluna chamada «mediano» seria mentir a quem a lesse
-- daqui a um ano. O `imo_benchmark_media()` da 0089 já lê
-- `coalesce(mediano, medio)`, por isso nada se perde.
--
-- A `dispersao` é calculada, não estimada: (P75-P25)/(P75+P25) é o
-- coeficiente quartílico de dispersão, uma estatística com nome.
--
-- ---------------------------------------------------------------------
-- LICENÇA
-- ---------------------------------------------------------------------
-- Mesma ficha de subscrição de 25-06-2026, mesmas três condições da 0090:
-- atribuição visível, só agregados, não concorrer com a fonte. O âmbito é
-- o do ponto 2 — os 18 concelhos da AML — e é por isso que a lista de
-- freguesias abaixo é fechada.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. A FONTE
-- ---------------------------------------------------------------------
insert into imo_fontes (id, nome, tipo, escalao, licenca, uso_interno,
                        saida_para_cliente, redistribuicao, atribuicao_obrigatoria, notas)
values
  ('sir-micro', 'MicroSIR · Confidencial Imobiliário', 'oferta', 2,
   'licenciado · Ficha de subscrição 25-06-2026, cláusula 4.d)',
   true, true, false, '© IMOESTATÍSTICA – TODOS OS DIREITOS RESERVADOS',
   'Percentis de €/m² por freguesia e concelho da AML, colhidos da conta '
   'subscrita. PREÇO PEDIDO, não escritura: precisa do price gap para '
   'virar valor de transação, e é isso que o ancoraSIR() faz. Escalão 2 de '
   'propósito — no 1 ganharia às transações no desempate por amostra e '
   'sobrevalorizaria a AML inteira em silêncio. Âmbito: 18 concelhos da '
   'AML. Janela móvel de 24 meses.')
on conflict (id) do update set
  nome = excluded.nome, tipo = excluded.tipo, escalao = excluded.escalao,
  licenca = excluded.licenca, uso_interno = excluded.uso_interno,
  saida_para_cliente = excluded.saida_para_cliente,
  redistribuicao = excluded.redistribuicao,
  atribuicao_obrigatoria = excluded.atribuicao_obrigatoria, notas = excluded.notas;

-- ---------------------------------------------------------------------
-- 2. AS 124 FREGUESIAS
-- ---------------------------------------------------------------------
-- Da CAOP (Carta Administrativa Oficial de Portugal). Não escritas à mão:
-- são 124 nomes e 124 códigos, e um engano num deles não daria erro —
-- daria os percentis de outra zona, plausíveis, a entrar na base para lá
-- ficarem.
--
-- `codigo_ine` recebe o DICOFRE, que é o que permite juntar isto a
-- qualquer outra fonte oficial sem depender de como o nome foi escrito.
-- `lat`/`lng` são o centro da bbox — aproximação assumida, serve para
-- ordenar por proximidade, não para medir distâncias ao metro.
--
-- `imo_geo_upsert` é idempotente e casa por `nome_chave`: as freguesias
-- de Oeiras que a 0087 já criara são reconhecidas, não duplicadas.
do $$
declare
  r record;
  v_conc uuid;
  v_id uuid;
  n_novas int := 0;
  n_total int := 0;
begin
  for r in
    select * from (values
    ('Alcochete', 'Alcochete', '150201', 38.748756, -8.917308),
    ('Alcochete', 'Samouco', '150202', 38.733224, -9.007982),
    ('Alcochete', 'São Francisco', '150203', 38.732287, -8.968782),
    ('Almada', 'Costa da Caparica', '150303', 38.606701, -9.219473),
    ('Almada', 'União das freguesias de Almada, Cova da Piedade, Pragal e Cacilhas', '150312', 38.675670, -9.164427),
    ('Almada', 'União das freguesias de Caparica e Trafaria', '150313', 38.653724, -9.222209),
    ('Almada', 'União das freguesias de Charneca de Caparica e Sobreda', '150314', 38.606950, -9.184610),
    ('Almada', 'União das freguesias de Laranjeiro e Feijó', '150315', 38.657222, -9.155136),
    ('Amadora', 'Águas Livres', '111513', 38.745661, -9.219772),
    ('Amadora', 'Alfragide', '111512', 38.733452, -9.219030),
    ('Amadora', 'Encosta do Sol', '111514', 38.770385, -9.212049),
    ('Amadora', 'Falagueira-Venda Nova', '111515', 38.758735, -9.218539),
    ('Amadora', 'Mina de Água', '111516', 38.777144, -9.237298),
    ('Amadora', 'Venteira', '111517', 38.746889, -9.244988),
    ('Barreiro', 'Santo António da Charneca', '150407', 38.614040, -9.022974),
    ('Barreiro', 'União das freguesias de Alto do Seixalinho, Santo André e Verderena', '150409', 38.644882, -9.061768),
    ('Barreiro', 'União das freguesias de Barreiro e Lavradio', '150410', 38.668755, -9.063637),
    ('Barreiro', 'União das freguesias de Palhais e Coina', '150411', 38.605708, -9.038768),
    ('Cascais', 'Alcabideche', '110501', 38.739753, -9.421371),
    ('Cascais', 'São Domingos de Rana', '110506', 38.722887, -9.339213),
    ('Cascais', 'União das freguesias de Carcavelos e Parede', '110507', 38.692204, -9.346191),
    ('Cascais', 'União das freguesias de Cascais e Estoril', '110508', 38.715022, -9.426554),
    ('Lisboa', 'Ajuda', '110601', 38.712595, -9.198108),
    ('Lisboa', 'Alcântara', '110602', 38.708563, -9.183911),
    ('Lisboa', 'Alvalade', '110654', 38.753853, -9.149152),
    ('Lisboa', 'Areeiro', '110655', 38.741929, -9.132808),
    ('Lisboa', 'Arroios', '110656', 38.726145, -9.139175),
    ('Lisboa', 'Avenidas Novas', '110657', 38.736565, -9.154051),
    ('Lisboa', 'Beato', '110607', 38.730859, -9.111532),
    ('Lisboa', 'Belém', '110658', 38.699837, -9.211940),
    ('Lisboa', 'Benfica', '110608', 38.737959, -9.196869),
    ('Lisboa', 'Campo de Ourique', '110659', 38.718190, -9.165094),
    ('Lisboa', 'Campolide', '110610', 38.731986, -9.167813),
    ('Lisboa', 'Carnide', '110611', 38.766420, -9.187418),
    ('Lisboa', 'Estrela', '110660', 38.704223, -9.162717),
    ('Lisboa', 'Lumiar', '110618', 38.771407, -9.162268),
    ('Lisboa', 'Marvila', '110621', 38.747460, -9.110550),
    ('Lisboa', 'Misericórdia', '110661', 38.705796, -9.146504),
    ('Lisboa', 'Olivais', '110633', 38.771272, -9.125349),
    ('Lisboa', 'Parque das Nações', '110662', 38.774590, -9.095700),
    ('Lisboa', 'Penha de França', '110663', 38.726202, -9.118962),
    ('Lisboa', 'Santa Clara', '110664', 38.786057, -9.153897),
    ('Lisboa', 'Santa Maria Maior', '110665', 38.708397, -9.129642),
    ('Lisboa', 'Santo António', '110666', 38.721745, -9.150482),
    ('Lisboa', 'São Domingos de Benfica', '110639', 38.746019, -9.173838),
    ('Lisboa', 'São Vicente', '110667', 38.715774, -9.121656),
    ('Loures', 'Bucelas', '110702', 38.909365, -9.126920),
    ('Loures', 'Fanhões', '110705', 38.890665, -9.162346),
    ('Loures', 'Loures', '110707', 38.844461, -9.195650),
    ('Loures', 'Lousa', '110708', 38.891713, -9.209778),
    ('Loures', 'União das freguesias de Camarate, Unhos e Apelação', '110731', 38.810830, -9.129408),
    ('Loures', 'União das freguesias de Moscavide e Portela', '110726', 38.782763, -9.110582),
    ('Loures', 'União das freguesias de Sacavém e Prior Velho', '110727', 38.794421, -9.115526),
    ('Loures', 'União das freguesias de Santa Iria de Azoia, São João da Talha e Bobadela', '110728', 38.828432, -9.094197),
    ('Loures', 'União das freguesias de Santo Antão e São Julião do Tojal', '110729', 38.861945, -9.142170),
    ('Loures', 'União das freguesias de Santo António dos Cavaleiros e Frielas', '110730', 38.818365, -9.159012),
    ('Mafra', 'Carvoeira', '110902', 38.939747, -9.400275),
    ('Mafra', 'Encarnação', '110904', 39.037776, -9.378917),
    ('Mafra', 'Ericeira', '110906', 38.970388, -9.399065),
    ('Mafra', 'Mafra', '110909', 38.964323, -9.328252),
    ('Mafra', 'Milharado', '110911', 38.934724, -9.210623),
    ('Mafra', 'Santo Isidoro', '110913', 38.997571, -9.385388),
    ('Mafra', 'União das freguesias de Azueira e Sobral da Abelheira', '110918', 38.997231, -9.296791),
    ('Mafra', 'União das freguesias de Enxara do Bispo, Gradil e Vila Franca do Rosário', '110919', 38.981833, -9.247362),
    ('Mafra', 'União das freguesias de Igreja Nova e Cheleiros', '110920', 38.912155, -9.329904),
    ('Mafra', 'União das freguesias de Malveira e São Miguel de Alcainça', '110921', 38.927881, -9.270305),
    ('Mafra', 'União das freguesias de Venda do Pinheiro e Santo Estêvão das Galés', '110922', 38.905457, -9.237504),
    ('Moita', 'Alhos Vedros', '150601', 38.642992, -9.013801),
    ('Moita', 'Moita', '150603', 38.640321, -8.971758),
    ('Moita', 'União das freguesias de Baixa da Banheira e Vale da Amoreira', '150607', 38.658670, -9.036963),
    ('Moita', 'União das freguesias de Gaio-Rosário e Sarilhos Pequenos', '150608', 38.675175, -9.004103),
    ('Montijo', 'Canha', '150701', 38.761428, -8.628757),
    ('Montijo', 'Sarilhos Grandes', '150704', 38.675562, -8.964044),
    ('Montijo', 'União das freguesias de Atalaia e Alto Estanqueiro-Jardia', '150709', 38.686298, -8.930839),
    ('Montijo', 'União das freguesias de Montijo e Afonsoeiro', '150710', 38.705692, -8.990828),
    ('Montijo', 'União das freguesias de Pegões', '150711', 38.683329, -8.674290),
    ('Odivelas', 'Odivelas', '111603', 38.791297, -9.182249),
    ('Odivelas', 'União das freguesias de Pontinha e Famões', '111608', 38.784009, -9.203905),
    ('Odivelas', 'União das freguesias de Póvoa de Santo Adrião e Olival Basto', '111609', 38.796591, -9.161860),
    ('Odivelas', 'União das freguesias de Ramada e Caneças', '111610', 38.814670, -9.207981),
    ('Oeiras', 'Barcarena', '111002', 38.733263, -9.282789),
    ('Oeiras', 'Porto Salvo', '111009', 38.729429, -9.302917),
    ('Oeiras', 'União das freguesias de Algés, Linda-a-Velha e Cruz Quebrada-Dafundo', '111012', 38.707356, -9.243350),
    ('Oeiras', 'União das freguesias de Carnaxide e Queijas', '111013', 38.726024, -9.242656),
    ('Oeiras', 'União das freguesias de Oeiras e São Julião da Barra, Paço de Arcos e Caxias', '111014', 38.694648, -9.294855),
    ('Palmela', 'Palmela', '150802', 38.576400, -8.884338),
    ('Palmela', 'Pinhal Novo', '150803', 38.640174, -8.896701),
    ('Palmela', 'Quinta do Anjo', '150804', 38.588514, -8.972323),
    ('Palmela', 'União das freguesias de Poceirão e Marateca', '150806', 38.626936, -8.734647),
    ('Seixal', 'Amora', '151002', 38.615383, -9.128772),
    ('Seixal', 'Arrentela', '151008', 38.611455, -9.090916),
    ('Seixal', 'Corroios', '151005', 38.614587, -9.150728),
    ('Seixal', 'Fernão Ferro', '151006', 38.571176, -9.088315),
    ('Seixal', 'Paio Pires', '151009', 38.611879, -9.071569),
    ('Seixal', 'Seixal', '151010', 38.645864, -9.091911),
    ('Sesimbra', 'Quinta do Conde', '151103', 38.558227, -9.066226),
    ('Sesimbra', 'Sesimbra (Castelo)', '151101', 38.492417, -9.120287),
    ('Sesimbra', 'Sesimbra (Santiago)', '151102', 38.445474, -9.097832),
    ('Setúbal', 'Gâmbia-Pontes-Alto da Guerra', '151207', 38.549401, -8.798830),
    ('Setúbal', 'Sado', '151208', 38.499837, -8.800156),
    ('Setúbal', 'Setúbal (São Sebastião)', '151205', 38.526892, -8.858162),
    ('Setúbal', 'União das freguesias de Azeitão (São Lourenço e São Simão)', '151209', 38.517341, -9.008354),
    ('Setúbal', 'União das freguesias de Setúbal (São Julião, Nossa Senhora da Anunciada e Santa Maria da Graça)', '151210', 38.523409, -8.921709),
    ('Sintra', 'Algueirão-Mem Martins', '111102', 38.803250, -9.333994),
    ('Sintra', 'Almargem do Bispo', '111129', 38.849092, -9.266776),
    ('Sintra', 'Belas', '111130', 38.788664, -9.277351),
    ('Sintra', 'Casal de Cambra', '111115', 38.802363, -9.231884),
    ('Sintra', 'Colares', '111105', 38.802063, -9.463055),
    ('Sintra', 'Montelavar', '111131', 38.869679, -9.315806),
    ('Sintra', 'Pêro Pinheiro', '111132', 38.839903, -9.320656),
    ('Sintra', 'Queluz', '111133', 38.754934, -9.259124),
    ('Sintra', 'Rio de Mouro', '111108', 38.768894, -9.332730),
    ('Sintra', 'São João das Lampas', '111134', 38.881770, -9.411204),
    ('Sintra', 'Terrugem', '111135', 38.862175, -9.363481),
    ('Sintra', 'União das freguesias de Agualva e Mira-Sintra', '111122', 38.773977, -9.293672),
    ('Sintra', 'União das freguesias de Massamá e Monte Abraão', '111125', 38.757604, -9.277813),
    ('Sintra', 'União das freguesias de Sintra (Santa Maria e São Miguel, São Martinho e São Pedro de Penaferrim)', '111128', 38.788519, -9.396975),
    ('Sintra', 'União das freguesias do Cacém e São Marcos', '111124', 38.764444, -9.302878),
    ('Vila Franca de Xira', 'União das freguesias de Alhandra, São João dos Montes e Calhandriz', '111412', 38.945628, -9.050733),
    ('Vila Franca de Xira', 'União das freguesias de Alverca do Ribatejo e Sobralinho', '111413', 38.904933, -9.042120),
    ('Vila Franca de Xira', 'União das freguesias de Castanheira do Ribatejo e Cachoeiras', '111414', 38.991453, -8.989649),
    ('Vila Franca de Xira', 'União das freguesias de Póvoa de Santa Iria e Forte da Casa', '111415', 38.864132, -9.059647),
    ('Vila Franca de Xira', 'Vialonga', '111408', 38.870785, -9.084577),
    ('Vila Franca de Xira', 'Vila Franca de Xira', '111409', 38.912413, -8.964001)
    ) as t(concelho, freguesia, dicofre, lat, lng)
  loop
    select id into v_conc from imo_geografias
     where nivel = 'concelho' and nome_chave = imo_chave(r.concelho) limit 1;

    -- Um concelho em falta é a 0091 não ter corrido. Parar é melhor do
    -- que criar 124 freguesias órfãs, que depois ninguém encontraria.
    if v_conc is null then
      raise exception 'O concelho "%" não existe na hierarquia. Corra a migração 0091 primeiro.', r.concelho;
    end if;

    select id into v_id from imo_geografias
     where nivel = 'freguesia' and pai_id = v_conc and nome_chave = imo_chave(r.freguesia);
    if v_id is null then n_novas := n_novas + 1; end if;

    v_id := imo_geo_upsert(v_conc, 'freguesia', r.freguesia, r.lat, r.lng);
    n_total := n_total + 1;

    update imo_geografias
       set codigo_ine = r.dicofre
     where id = v_id and codigo_ine is distinct from r.dicofre;
  end loop;

  raise notice 'Freguesias da AML: % no total, % novas.', n_total, n_novas;
end $$;

-- ---------------------------------------------------------------------
-- 3. O CARREGADOR
-- ---------------------------------------------------------------------
-- Recebe o Dataset do Actor tal e qual — um array de registos como este:
--
--   {"source":"MicroSIR","zone":"Oeiras · União das freguesias de …",
--    "months":24,"sample_count":1285,
--    "price_m2":{"p25":3557,"average":4486,"p75":5087},
--    "geo":{"nivel":"freguesia","concelho":"Oeiras","freguesia":"União…",
--           "dicofre":"111013","cobertura":0.62},
--    "collected_at":"2026-08-23T00:37:00Z","warnings":[]}
--
-- A junção é pelo DICOFRE quando existe, e só pelo nome quando não —
-- códigos não mudam de grafia, nomes mudam.
--
-- Zonas sem valores (o MicroSIR devolve vazio nas bboxes maiores, como
-- Lisboa e Sintra concelho) são CONTADAS e IGNORADAS, não gravadas: um
-- benchmark sem preço não é um benchmark, é ruído numa tabela que o motor
-- consulta.
create or replace function imo_sir_micro_carregar(p_payload jsonb)
returns table (gravadas int, sem_valores int, sem_geografia int, avisos text[])
language plpgsql security definer set search_path = public as $$
declare
  r jsonb;
  v_geo uuid;
  v_conc uuid;
  v_nivel text;
  v_p25 numeric; v_med numeric; v_p75 numeric;
  v_n int;
  v_quando timestamptz;
  v_periodo text;
  v_meses int;
  v_gravadas int := 0;
  v_sem_val int := 0;
  v_sem_geo int := 0;
  v_avisos text[] := array[]::text[];
begin
  if jsonb_typeof(p_payload) <> 'array' then
    raise exception 'Esperava um array de registos; recebi %.', jsonb_typeof(p_payload);
  end if;

  for r in select * from jsonb_array_elements(p_payload)
  loop
    v_p25 := nullif(r #>> '{price_m2,p25}', '')::numeric;
    v_med := nullif(r #>> '{price_m2,average}', '')::numeric;
    v_p75 := nullif(r #>> '{price_m2,p75}', '')::numeric;
    v_n   := nullif(r ->> 'sample_count', '')::int;

    -- Sem média não há benchmark. É o caso de Lisboa e Sintra ao nível de
    -- concelho: a API devolve a estrutura vazia para bboxes muito
    -- grandes, e isso é uma limitação da fonte, não um erro nosso.
    if v_med is null then
      v_sem_val := v_sem_val + 1;
      continue;
    end if;

    v_nivel := coalesce(r #>> '{geo,nivel}', 'freguesia');

    -- Geografia: primeiro pelo código, depois pelo nome.
    v_geo := null;
    if coalesce(r #>> '{geo,dicofre}', '') <> '' then
      select id into v_geo from imo_geografias
       where nivel = v_nivel and codigo_ine = r #>> '{geo,dicofre}' limit 1;
    end if;

    if v_geo is null then
      select id into v_conc from imo_geografias
       where nivel = 'concelho' and nome_chave = imo_chave(r #>> '{geo,concelho}') limit 1;

      if v_nivel = 'concelho' then
        v_geo := v_conc;
      elsif v_conc is not null then
        select id into v_geo from imo_geografias
         where nivel = 'freguesia' and pai_id = v_conc
           and nome_chave = imo_chave(r #>> '{geo,freguesia}') limit 1;
      end if;
    end if;

    if v_geo is null then
      v_sem_geo := v_sem_geo + 1;
      v_avisos := v_avisos || format('Sem geografia para "%s".', r ->> 'zone');
      continue;
    end if;

    v_quando := coalesce((r ->> 'collected_at')::timestamptz, now());
    v_meses := coalesce(nullif(r ->> 'months', '')::int, 24);
    -- O período diz a JANELA, não o mês: estes números descrevem 24 meses
    -- que acabam na data da colheita. Escrever «2026-08» faria parecer
    -- que são de agosto.
    v_periodo := to_char(v_quando, 'YYYY-MM') || ' · ' || v_meses || 'm';

    insert into imo_benchmarks (
      fonte_id, geografia_id, tipo_imovel, tipologia, periodo, periodo_fim,
      eur_m2_mediano, eur_m2_medio, eur_m2_p25, eur_m2_p75,
      n_transacoes, dispersao, extra
    ) values (
      'sir-micro', v_geo, '', '', v_periodo, v_quando::date,
      -- Mediano fica NULO de propósito: o MicroSIR não a publica, e a
      -- média não é a mediana.
      null, v_med, v_p25, v_p75,
      v_n,
      -- Coeficiente quartílico de dispersão. Calculado, não estimado.
      case when v_p25 is not null and v_p75 is not null and (v_p75 + v_p25) > 0
           then round((v_p75 - v_p25) / (v_p75 + v_p25), 4)
           else null end,
      jsonb_build_object(
        'natureza', 'oferta',
        'nivel', v_nivel,
        'zona', r ->> 'zone',
        'dicofre', r #>> '{geo,dicofre}',
        'janela_meses', v_meses,
        'n_observacoes', v_n,
        -- Quanto da bbox é mesmo esta zona. Abaixo de ~0,35 o número diz
        -- mais dos vizinhos do que da zona, e quem publicar tem de saber.
        'cobertura_bbox', nullif(r #>> '{geo,cobertura}', '')::numeric,
        'avisos_colheita', coalesce(r -> 'warnings', '[]'::jsonb),
        'colhido_em', v_quando
      )
    )
    on conflict (fonte_id, geografia_id, tipo_imovel, tipologia, periodo)
    do update set
      eur_m2_medio = excluded.eur_m2_medio,
      eur_m2_p25   = excluded.eur_m2_p25,
      eur_m2_p75   = excluded.eur_m2_p75,
      n_transacoes = excluded.n_transacoes,
      dispersao    = excluded.dispersao,
      periodo_fim  = excluded.periodo_fim,
      extra        = excluded.extra;

    v_gravadas := v_gravadas + 1;
  end loop;

  return query select v_gravadas, v_sem_val, v_sem_geo, v_avisos;
end $$;

-- ---------------------------------------------------------------------
-- 4. O ACESSO — igual ao imo_benchmark(), mas para OFERTA
-- ---------------------------------------------------------------------
-- O `imo_benchmark()` filtra `escalao = 1` e é bom que continue: é a
-- porta das transações e não deve deixar entrar preços pedidos.
--
-- Esta é a porta ao lado. Sobe na hierarquia pela mesma regra — a zona
-- mais fina COM AMOSTRA que chegue, e diz sempre de que nível veio. É
-- assim que a freguesia serve quando tem dados e o concelho toma conta
-- quando não tem, sem que a decisão fique escondida num número.
create or replace function imo_benchmark_oferta(
  p_geografia uuid, p_tipo text default '', p_tipologia text default '',
  p_min_amostra integer default 30
) returns table (
  benchmark_id uuid, fonte_id text, geografia_id uuid, nivel text,
  nome text, eur_m2 numeric, eur_m2_p25 numeric, eur_m2_p75 numeric,
  n_observacoes integer, dispersao numeric, cobertura numeric,
  periodo text, atribuicao text
)
language plpgsql stable security definer set search_path = public as $$
declare v_geo uuid := p_geografia;
begin
  while v_geo is not null loop
    return query
      select b.id, b.fonte_id, b.geografia_id, g.nivel, g.nome,
             coalesce(b.eur_m2_mediano, b.eur_m2_medio),
             b.eur_m2_p25, b.eur_m2_p75,
             b.n_transacoes, b.dispersao,
             (b.extra ->> 'cobertura_bbox')::numeric,
             b.periodo, f.atribuicao_obrigatoria
        from imo_benchmarks b
        join imo_geografias g on g.id = b.geografia_id
        join imo_fontes f on f.id = b.fonte_id
       where b.geografia_id = v_geo
         and f.escalao = 2
         and coalesce(b.eur_m2_mediano, b.eur_m2_medio) is not null
         and (b.tipo_imovel = '' or imo_chave(b.tipo_imovel) = imo_chave(p_tipo))
         and (b.tipologia = '' or imo_chave(b.tipologia) = imo_chave(p_tipologia))
         and coalesce(b.n_transacoes, 0) >= p_min_amostra
       -- Mais recente primeiro: numa janela móvel, a colheita de agosto
       -- descreve melhor o mercado do que a de junho. Só depois a amostra.
       order by b.periodo_fim desc nulls last, b.n_transacoes desc nulls last
       limit 1;
    if found then return; end if;

    select pai_id into v_geo from imo_geografias where id = v_geo;
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 5. PERMISSÕES
-- ---------------------------------------------------------------------
revoke all on function imo_sir_micro_carregar(jsonb) from public, anon;
revoke all on function imo_benchmark_oferta(uuid, text, text, integer) from public, anon;
grant execute on function imo_sir_micro_carregar(jsonb) to service_role;
grant execute on function imo_benchmark_oferta(uuid, text, text, integer) to service_role;

comment on function imo_sir_micro_carregar(jsonb) is
  'Carrega o Dataset do Actor microsir em imo_benchmarks. Idempotente: '
  'correr duas vezes a mesma colheita atualiza, não duplica. Devolve '
  'quantas gravou, quantas vinham sem valores e quantas não encontraram '
  'geografia — os três números que dizem se a colheita prestou.';

comment on function imo_benchmark_oferta(uuid, text, text, integer) is
  'O benchmark de OFERTA mais granular com amostra suficiente, subindo na '
  'hierarquia até encontrar. Separado do imo_benchmark() de propósito: '
  'preço pedido e preço de escritura não se misturam na mesma consulta. '
  'Para virar valor de transação falta o price gap — é o que o ancoraSIR() faz.';
