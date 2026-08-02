-- 0051 — Ponte «A Sede»: liga a organização do portal (orgs, multi-tenant) ao
-- registo interno do cliente (clientes, CRM interno). Permite que a Sede (portal
-- do cliente autenticado) resolva com segurança os dados internos do cliente
-- (relatórios, planos, ficha) a partir da sessão → org → cliente_id.
--
-- Migração aditiva e anulável: enquanto não for preenchida, a Sede mostra só os
-- módulos multi-tenant (leads) e trata os internos como «ainda não ligado».

alter table orgs add column if not exists cliente_id uuid references clientes(id) on delete set null;

create index if not exists orgs_cliente_id_idx on orgs(cliente_id);

comment on column orgs.cliente_id is 'Ponte para clientes.id (CRM interno). Preenchido pelo staff. Usado pela Sede para servir relatórios/planos/ficha do cliente com isolamento por sessão.';
