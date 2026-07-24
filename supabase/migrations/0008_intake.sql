-- =====================================================================
-- Nº 5 · Diagnóstico preenchido pelo próprio cliente + duplo investimento
--
-- O comercial cria o lead e gera um link. O cliente abre-o e conta o seu
-- negócio, o que quer alcançar e (opcional) a sua lista de desejos e a
-- faixa de orçamento. Recebemos tudo no CRM e preparamos a proposta, que
-- mostra "o que pediste" ao lado de "a nossa recomendação".
-- Correr no SQL Editor do Supabase. Seguro de correr novamente.
-- =====================================================================

-- Cada cliente tem um link de diagnóstico próprio.
alter table clientes
  add column if not exists intake_token uuid unique default gen_random_uuid(),
  add column if not exists intake_submetido_em timestamptz;

-- Garante token aos clientes que já existiam antes desta migração.
update clientes set intake_token = gen_random_uuid() where intake_token is null;

-- O que o cliente disse que quer (a "lista de desejos" + orçamento).
-- Estrutura igual a um Escopo, para se calcular com a mesma tabela de preços.
alter table diagnosticos
  add column if not exists pedido jsonb not null default '{}'::jsonb,
  -- 'comercial' = preenchido por nós; 'cliente' = preenchido pelo próprio.
  add column if not exists origem text not null default 'comercial';

-- Na proposta, o pedido do cliente fica ao lado da nossa recomendação.
alter table propostas
  add column if not exists escopo_pedido jsonb not null default '{}'::jsonb;
