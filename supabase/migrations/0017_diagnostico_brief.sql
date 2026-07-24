-- =====================================================================
-- Nº 5 · Diagnóstico profundo — o brief do cliente
--
-- O diagnóstico que o cliente preenche passa a ser fundo: público, tom de
-- voz, referências, site novo, automação (assistente/chatbot/WhatsApp),
-- ambição. Tudo num só campo jsonb flexível, para alimentar propostas à
-- medida e com exemplos do que podemos construir.
-- Correr no SQL Editor do Supabase. Seguro de correr novamente.
-- =====================================================================

alter table diagnosticos
  add column if not exists brief jsonb not null default '{}'::jsonb;
