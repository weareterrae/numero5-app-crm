-- =====================================================================
-- 0099 · Cada bot social passa a ter o seu próprio registo
-- ---------------------------------------------------------------------
-- Na 0094 registei UM assistente para os oito bots de FB/IG, e escrevi
-- na altura que se perdia a atribuição por marca. A razão era não ter de
-- mexer nos oito projetos Supabase.
--
-- Era a troca errada. Quem paga a fatura quer saber quanto custa a
-- KoolNature e quanto custa a Massa Prima — não «social-inbox: $4».
-- Sem isso não há decisão possível sobre nenhuma delas.
--
-- COMO SE DISTINGUEM SEM MEXER NOS OITO PROJETOS
--
-- O meta-inbox de cada marca envia o SEU prompt. O redator reconhece a
-- marca por esse texto e escolhe a chave certa. Não é elegante — a via
-- limpa é cada projeto dizer quem é — mas é honesto, é determinístico, e
-- não obriga a oito publicações para se começar a medir.
--
-- Quando houver outra razão para tocar nos oito, passa-se a um
-- cabeçalho explícito e isto reduz-se a uma linha. Até lá, mede-se.
--
-- `social-inbox` FICA. É para onde cai o que não se reconhecer — e uma
-- marca nova a aparecer ali é o sinal de que falta registá-la, em vez de
-- desaparecer numa média.
-- =====================================================================

insert into ai_assistants (
  assistant_key, nome, marca, descricao,
  allowed_domains, ativo, legacy_enabled, gateway_enabled, traffic_percentage,
  routing_policy_id, max_messages, max_chars_message, max_output_tokens,
  temperature, retention_days, permite_system_dinamico, permite_json
)
select
  v.chave, v.nome, v.marca,
  'Caixa de entrada de Facebook e Instagram, servida pelo proxy redator. '
  'O prompt vem do meta-inbox da marca; este registo dá a cadeia de '
  'modelos, o disjuntor, o registo de custo e os incidentes.',
  array['https://quenteebom.com', 'https://www.quenteebom.com'],
  true, false, true, 100,
  (select routing_policy_id from ai_assistants where assistant_key = 'social-inbox'),
  16, 4000, 2048, 0.7, 90, true, false
from (values
  ('social-koolnature',  'Chef Kool · caixa de entrada',    'KoolNature'),
  ('social-quenteebom',  'Chef Joaquim · caixa de entrada', 'Quente e Bom'),
  ('social-massaprima',  'Chef Prima · caixa de entrada',   'Massa Prima'),
  ('social-aguaminda',   'Kianda · caixa de entrada',       'Água Minda'),
  ('social-numerocinco', 'Quinto · caixa de entrada',       'Nº 5'),
  ('social-terrae',      'Joaquim · caixa de entrada',      'Terrae'),
  ('social-mariagoreti', 'Maria Goreti · caixa de entrada', 'Maria Goreti'),
  ('social-externato',   'Avó Maria · caixa de entrada',    'Externato Santa Maria de Belém')
) as v(chave, nome, marca)
where not exists (select 1 from ai_assistants where assistant_key = v.chave);

-- A marca do social-inbox passa a dizer o que ele é agora: a rede, não
-- o destino. Se aparecer custo aqui, é uma marca por registar.
update ai_assistants
   set marca = 'Nº 5 · por identificar',
       descricao = 'Rede dos bots sociais: recebe o que o redator não '
                   'conseguiu atribuir a uma marca. Custo aqui significa '
                   'que falta reconhecer um prompt novo, não que há um bot '
                   'anónimo a funcionar.'
 where assistant_key = 'social-inbox';
