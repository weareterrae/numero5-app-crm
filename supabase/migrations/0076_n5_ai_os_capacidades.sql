-- =====================================================================
-- N5 AI OS · capacidades por classe de pedido                  [0076]
-- ---------------------------------------------------------------------
-- Nasce da leitura do código da Terrae (terraesite/_shared/anthropic.js),
-- que já traz cicatrizes de produção que o gateway não tinha:
--
--  1. GROUNDING — os diagnósticos precisam de pesquisa web real. Em
--     Gemini é `tools: [{ google_search: {} }]`. Sem isso, o prompt deles
--     (que PROÍBE citar números de mercado não vindos da pesquisa) faria
--     o modelo devolver campos vazios. Diagnósticos sem números.
--
--  2. ORÇAMENTO DE SAÍDA POR CLASSE — um diagnóstico gera JSON grande
--     (~8000 tokens); um chat precisa de ~800. Um teto único serve mal
--     os dois: corta o JSON a meio ou desperdiça.
--
--  3. A LIÇÃO DO THINKING — thinkingBudget:0 dá 400 no Pro, e os flash
--     recentes podem IGNORÁ-LO sem erro, pensando à mesma e comendo o
--     orçamento. Sintoma real documentado lá: respostas truncadas a meio
--     ("…2.98"). Por isso o teto vai sempre com folga por cima.
--     maxOutputTokens é um TETO, não um gasto — subir é seguro.
--
-- Tudo isto passa a ser configuração no registo, não código.
-- =====================================================================

alter table ai_routing_rules
  add column if not exists max_output_tokens integer,
  add column if not exists grounding         boolean not null default false,
  add column if not exists temperature       numeric(3,2),
  -- Folga por cima do conteúdo, para o "thinking" não truncar a resposta.
  add column if not exists token_headroom    integer not null default 6000;

comment on column ai_routing_rules.max_output_tokens is
  'Tokens de saída que o CONTEÚDO precisa nesta classe. null = usa o do assistente.';
comment on column ai_routing_rules.grounding is
  'Liga pesquisa web no fornecedor (Gemini: tools[{google_search:{}}]). Necessário aos diagnósticos.';
comment on column ai_routing_rules.token_headroom is
  'Folga somada ao teto: os modelos podem "pensar" mesmo com thinkingBudget:0 e truncar a resposta.';

-- Modelos: registar quem sabe fazer pesquisa, para o router não mandar
-- um pedido com grounding para um modelo que o ignora em silêncio.
alter table ai_models
  add column if not exists supports_grounding boolean not null default false;

comment on column ai_models.supports_grounding is
  'Suporta pesquisa web server-side. Gemini: google_search. Sem isto, uma classe com grounding não deve escolher este modelo.';

-- Os Gemini suportam google_search; os GPT via chat/completions, não.
update ai_models set supports_grounding = true  where provider_id = 'google';
update ai_models set supports_grounding = false where provider_id in ('openai', 'bedrock', 'anthropic');

-- Classes de diagnóstico: JSON grande + pesquisa obrigatória.
update ai_routing_rules set grounding = true, max_output_tokens = 8000, temperature = 0.40
where request_class in ('COMPLEX', 'HIGH_VALUE_COMMERCIAL');

-- Chat: curto e barato.
update ai_routing_rules set max_output_tokens = 800
where request_class in ('SIMPLE', 'FAQ', 'STANDARD');

insert into schema_migrations (version) values ('0076')
on conflict (version) do nothing;
