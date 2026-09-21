-- A chave dos assistentes chamados de um SERVIDOR (21/09/2026, a pedido do Sandro)
--
-- A allowlist de origem (allowed_domains) protege os assistentes que um browser chama:
-- um site alheio não consegue pôr o nosso domínio no cabeçalho Origin. Um servidor
-- consegue, porque o cabeçalho é só texto. Os assistentes da QB Digital OS são chamados
-- do servidor da QB e aceitam o system de quem chama: quem soubesse o nome «qb-joaquim»
-- tinha uma IA paga pelo Sandro.
--
-- Com `chave_hash` preenchida, o gateway só responde a quem trouxer a chave no cabeçalho
-- x-n5-chave (ver chaveConfere em _shared/n5-ai/registry.ts), e a esses dispensa o limite
-- de 20 pedidos por minuto por IP (o servidor da QB partilha meia dúzia de IPs com a casa
-- inteira). Guarda-se o SHA-256 da chave, nunca a chave.
--
-- Vazia = como sempre foi. É o caso de todos os assistentes chamados por um browser, que
-- não podem guardar segredo nenhum.

alter table public.ai_assistants add column if not exists chave_hash text;

comment on column public.ai_assistants.chave_hash is
  'SHA-256 (hex) da chave exigida no cabeçalho x-n5-chave. Só para assistentes chamados de um servidor. Vazio = sem chave.';
