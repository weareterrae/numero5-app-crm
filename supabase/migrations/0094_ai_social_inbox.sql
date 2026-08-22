-- =====================================================================
-- 0094 · Os bots sociais passam a ter assistente no gateway
-- ---------------------------------------------------------------------
-- Os oito bots de Facebook e Instagram (Chef Kool, Quinto, Kianda, Chef
-- Joaquim, Chef Prima, Maria Goreti, Avó Maria, Joaquim da Terrae) nunca
-- passaram pelo gateway. Falam com a Google diretamente, através do
-- proxy `redator` do site da Quente e Bom.
--
-- O que isso lhes custa, e é tudo o que construímos este ano:
--
--   · sem disjuntor — um modelo sobrecarregado não abre caminho a outro
--   · sem cadeia entre FORNECEDORES — só Gemini; se a Google tiver um
--     mau dia, os oito calam-se ao mesmo tempo
--   · sem registo de pedidos — não se sabe quantos, nem quanto custam
--   · sem incidentes — uma avaria não aparece em lado nenhum
--   · sem orçamento — não há travão de custo
--
-- E a reserva que tinham estava caducada: `gemini-2.0-flash`, aposentado.
--
-- UM ASSISTENTE PARA OS OITO, e porquê
--
-- Cada bot já envia o SEU prompt (o da caixa de entrada, diferente do do
-- site). Como `permite_system_dinamico` é verdadeiro, um só registo
-- serve os oito sem os misturar: o que os distingue viaja no pedido.
--
-- A alternativa — oito registos — obrigava a mexer nos oito projetos
-- Supabase para cada um saber quem é. Isso fica para quando houver outra
-- razão para lhes tocar; a atribuição por marca chega então, e até lá o
-- registo diz «social-inbox», que é verdade.
--
-- ORIGEM: o redator corre em funções Netlify da Quente e Bom, e é ele
-- que fala com o gateway em nome dos oito. A allowlist reflete isso.
-- =====================================================================

insert into ai_assistants (
  assistant_key, nome, marca, descricao,
  allowed_domains, ativo, legacy_enabled, gateway_enabled, traffic_percentage,
  routing_policy_id, max_messages, max_chars_message, max_output_tokens,
  temperature, retention_days, permite_system_dinamico, permite_json
)
select
  'social-inbox',
  'Bots sociais · caixa de entrada',
  'Nº 5 (multimarca)',
  'Os oito bots de FB/IG, servidos pelo proxy redator. Cada marca envia o '
  'seu próprio system; o que este registo dá é a cadeia de modelos, o '
  'disjuntor, o registo e os incidentes que eles não tinham.',
  array['https://quenteebom.com', 'https://www.quenteebom.com'],
  true, false, true, 100,
  -- A mesma política de encaminhamento dos assistentes de conversa: é
  -- disso que se trata, uma conversa curta com uma pessoa.
  (select routing_policy_id from ai_assistants where assistant_key = 'quenteebom-joaquim'),
  16, 4000,
  -- Mais folga do que um chat de site: estes respondem a mensagens de
  -- Instagram que podem trazer contexto longo, e um corte a meio numa
  -- caixa de entrada lê-se como falta de educação.
  2048,
  0.7, 90,
  -- Cada marca manda o seu prompt. Sem isto, os oito falariam igual.
  true,
  false
where not exists (select 1 from ai_assistants where assistant_key = 'social-inbox');
