-- =====================================================================
-- Nº 5 · Dados de faturação do cliente
--
-- O que é preciso para emitir uma fatura/recibo: a entidade fiscal (que
-- pode ser diferente do nome da marca), o NIF e a morada.
-- Correr no SQL Editor do Supabase. Seguro de correr novamente.
-- =====================================================================

alter table clientes
  add column if not exists empresa_fiscal text,   -- razão social / nome fiscal
  add column if not exists nif           text,
  add column if not exists morada        text,
  add column if not exists codigo_postal text,
  add column if not exists localidade    text;
