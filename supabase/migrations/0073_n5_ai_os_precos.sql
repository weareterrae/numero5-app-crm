-- =====================================================================
-- N5 AI OS · preços reais no registo                            [0073]
-- ---------------------------------------------------------------------
-- Sem preços no registo, o ledger grava estimated_cost = null e todo o
-- controlo de orçamento fica decorativo. Estes valores vêm da tabela
-- oficial de preços da Gemini API (ai.google.dev/gemini-api/docs/pricing,
-- consultada a 21/08/2026), nível pago, USD por 1M de tokens.
--
-- Nota: gemini-pro-latest é um ALIAS. Hoje resolve para o nível Pro
-- (preço ≤200k de contexto). Se a Google mudar o alias, o preço muda
-- sob os pés — mais uma razão para migrar para versões explícitas.
-- =====================================================================

update ai_models set input_cost = 2.00, output_cost = 12.00, cached_input_cost = 0.20,
  notas = coalesce(notas,'') || ' | Preço: nível Pro ≤200k ctx (doc oficial 21/08/2026).'
where provider_id = 'google' and provider_model_id = 'gemini-pro-latest';

update ai_models set input_cost = 1.50, output_cost = 9.00, cached_input_cost = 0.15,
  notas = coalesce(notas,'') || ' | Preço oficial 21/08/2026.'
where provider_id = 'google' and provider_model_id = 'gemini-3.5-flash';

-- gemini-flash-lite-latest resolveu para gemini-3.5-flash-lite no teste de 21/08
update ai_models set input_cost = 0.30, output_cost = 2.50, cached_input_cost = 0.03,
  notas = coalesce(notas,'') || ' | Preço de gemini-3.5-flash-lite (o que o alias resolveu), oficial 21/08/2026.'
where provider_id = 'google' and provider_model_id = 'gemini-flash-lite-latest';

update ai_models set input_cost = 0.25, output_cost = 1.50, cached_input_cost = 0.025,
  notas = coalesce(notas,'') || ' | Preço texto/imagem/vídeo, oficial 21/08/2026.'
where provider_id = 'google' and provider_model_id = 'gemini-3.1-flash-lite';

-- Bedrock: Luna e Sol ficaram sem preço na migração 0071 por falta de
-- confirmação. Continuam sem preço e DESLIGADOS — o registo prefere um
-- vazio honesto a um número inventado. Preencher antes de os ativar.

insert into schema_migrations (version) values ('0073')
on conflict (version) do nothing;
