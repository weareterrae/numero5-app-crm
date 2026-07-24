-- =====================================================================
-- Nº 5 · Kit de marca + checklist de onboarding do cliente
--
-- Para a produção ser repetível: onde estão o logo e os ativos, as cores,
-- as fontes, notas de marca/acessos (NUNCA passwords). E um checklist de
-- arranque para não falhar passos quando um lead vira cliente.
-- Correr no SQL Editor do Supabase. Seguro de correr novamente.
-- =====================================================================

alter table clientes
  add column if not exists kit_logo   text,        -- link para logo / pasta de ativos
  add column if not exists kit_cores  text,
  add column if not exists kit_fontes text,
  add column if not exists kit_notas  text,        -- notas de marca / acessos (sem passwords)
  add column if not exists onboarding jsonb not null default '{}'::jsonb;
