-- =====================================================================
-- Nº 5 · Idioma do cliente
--
-- O idioma acompanha o cliente em tudo o que é virado para ele: diagnóstico,
-- proposta, plano, relatório, mensagens e a IA. Captado do site (quem vem do
-- /en/ fica 'en'), editável na ficha. O painel do operador fica sempre em PT.
-- Correr no SQL Editor do Supabase. Seguro de correr novamente.
-- =====================================================================

alter table clientes
  add column if not exists idioma text not null default 'pt' check (idioma in ('pt', 'en'));
