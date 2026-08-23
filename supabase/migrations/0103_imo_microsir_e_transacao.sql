-- =====================================================================
-- 0103 · O MicroSIR é TRANSAÇÃO, não oferta
-- ---------------------------------------------------------------------
-- A 0101 pôs esta fonte no escalão 2 (oferta) e deixou escrito porquê:
--
--   «SE SE CONFIRMAR que o MicroSIR publica escrituras e não anúncios,
--    muda-se `tipo` e `escalao` desta fonte numa linha. O caminho
--    conservador é recuperável; o outro não.»
--
-- Confirmou-se. A página do produto da Confidencial Imobiliário
-- (confidencialimobiliario.com/pt/base-de-dados/micro-sir) diz:
--
--   «PREÇOS DE TRANSAÇÃO À MICRO-ZONA — TRANSAÇÕES GEORREFERENCIADAS A
--    PARTIR DOS CENTROIDES DOS CÓDIGOS-POSTAIS A 7 DÍGITOS.»
--
-- E os números batem certo com isso. Loures deu 8 326 observações em 24
-- meses, ou seja ~4 100 por ano — que é a ordem de grandeza das
-- escrituras de habitação naquele concelho, não a do stock de anúncios.
-- Cascais, 7 817, idem. Se fossem anúncios, seriam muitos mais.
--
-- ---------------------------------------------------------------------
-- O QUE ISTO MUDA, E É MUITO
-- ---------------------------------------------------------------------
-- Passam a ser a MELHOR fonte de transação da casa: 140 zonas da AML, ao
-- nível da freguesia, com amostras na ordem dos milhares, atualizadas
-- todos os meses. O INE é público mas grosseiro; os relatórios SIR em PDF
-- são finos mas cobrem seis concelhos e entram à mão.
--
-- E deixa de ser preciso o price gap para os usar. O gap serve para
-- converter oferta em escritura; se já são escritura, não há nada a
-- converter — aplicá-lo desvalorizaria o imóvel em 21-27% sem razão
-- nenhuma.
--
-- ---------------------------------------------------------------------
-- UMA PERGUNTA QUE FICA ABERTA, DE PROPÓSITO
-- ---------------------------------------------------------------------
-- Os benchmarks da fonte `sir` (relatórios PDF) guardam `desconto_medio`
-- (o price gap) JUNTO com valores que o próprio script diz virem «da
-- página do Micro-SIR». Se esses valores também são de transação, então o
-- `ancoraSIR()` — que faz `escritura = eur_m2 * (1 + desconto)` — está a
-- descontar preços que já são escrituras.
--
-- NÃO se mexe nisso aqui. É uma leitura minha sobre dados que já
-- sustentam avaliações, e a decisão é de quem conhece os relatórios. Fica
-- escrito para não se perder.
-- =====================================================================

update imo_fontes set
  tipo = 'transacao',
  escalao = 1,
  notas =
    'Percentis de €/m² por freguesia e concelho da AML, colhidos da conta '
    'subscrita. PREÇOS DE TRANSAÇÃO georreferenciados a partir dos '
    'centroides dos códigos-postais a 7 dígitos — confirmado na página do '
    'produto da Confidencial Imobiliário. NÃO aplicar price gap: estes '
    'valores já são escritura, e descontá-los outra vez tira 21-27% sem '
    'razão. Âmbito: 18 concelhos da AML. Janela móvel de 24 meses. '
    'Área: bruta privativa (por confirmar na plataforma).'
where id = 'sir-micro';

-- Os registos já carregados dizem «natureza: oferta». Corrige-se o que
-- está gravado, senão quem ler o `extra` daqui a um ano acredita nele —
-- e um campo errado que ninguém revê é pior do que um campo ausente.
update imo_benchmarks set
  extra = extra
    || jsonb_build_object(
         'natureza', 'transacao',
         'natureza_origem',
           'confidencialimobiliario.com/pt/base-de-dados/micro-sir: '
           '«preços de transação à micro-zona»',
         -- A geografia da fonte não é a freguesia: é o centroide do
         -- código-postal a 7 dígitos. A bbox apanha os centroides que lá
         -- caem. Quem interpretar isto como «todas as vendas da
         -- freguesia» está a ler a mais.
         'georreferenciacao', 'centroides de códigos-postais a 7 dígitos'
       )
where fonte_id = 'sir-micro';

-- ---------------------------------------------------------------------
-- O ACESSO À OFERTA CONTINUA A EXISTIR — mas fica vazio, e ainda bem
-- ---------------------------------------------------------------------
-- O `imo_benchmark_oferta()` da 0101 filtra `escalao = 2`. Com o MicroSIR
-- a passar para o 1, sobra lá a fonte `portais`. A função continua certa
-- e continua a ser precisa no dia em que se colher oferta a sério; o que
-- muda é que o MicroSIR deixa de entrar por essa porta e passa a entrar
-- pela das transações, que é onde pertence.
comment on function imo_benchmark_oferta(uuid, text, text, integer) is
  'O benchmark de OFERTA (escalão 2) mais granular com amostra suficiente. '
  'Desde a 0103 o MicroSIR já NÃO entra aqui: confirmou-se que publica '
  'preços de transação, e passou para o imo_benchmark(). Esta porta fica '
  'para quando houver dados de oferta a sério.';
