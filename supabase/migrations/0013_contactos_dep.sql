-- =====================================================================
-- Nº 5 · Contactos por departamento (um CRM a sério)
-- Cada cliente pode ter várias pessoas: o decisor, o financeiro, o
-- marketing, o técnico. Correr no SQL Editor do Supabase.
-- =====================================================================

alter table contactos
  add column if not exists departamento text;
