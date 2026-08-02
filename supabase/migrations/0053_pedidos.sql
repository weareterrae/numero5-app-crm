-- 0053 — Balcão de pedidos: o cliente abre pedidos na Sede («um post para
-- sexta», «muda o horário no site»); a equipa acompanha o estado.

create table if not exists pedidos (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references clientes(id) on delete cascade,
  texto text not null,
  estado text not null default 'novo' check (estado in ('novo', 'em_curso', 'feito')),
  nota_equipa text,
  autor_id uuid references auth.users(id),
  criado_em timestamptz not null default now(),
  resolvido_em timestamptz
);

create index if not exists pedidos_cliente_idx on pedidos (cliente_id, criado_em desc);

alter table pedidos enable row level security;
-- Tabela interna (keyed a clientes): staff acede via RLS; a Sede acede via
-- service-role estritamente filtrado pelo cliente da sessão.
create policy pedidos_auth_all on pedidos for all to authenticated using (true) with check (true);

comment on table pedidos is 'Pedidos abertos pelo cliente na Sede (Balcão). estado: novo|em_curso|feito.';
