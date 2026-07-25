-- 0033_ordens_alteracao.sql
-- Fase 2, Bloco 10 — Ordens de alteração. Quando o cliente pede algo fora do
-- âmbito, gera-se uma ordem que ele aceita/recusa/pede esclarecimento. Só
-- depois de aceite entra na produção (salvo decisão manual).

create table if not exists ordens_alteracao (
  id           uuid primary key default gen_random_uuid(),
  cliente_id   uuid not null references clientes(id) on delete cascade,
  titulo       text not null,
  descricao    text,
  origem       text,                                 -- de onde veio o pedido
  impacto      text,                                 -- o que muda no plano/prazos
  prazo        date,
  horas        numeric,
  preco        numeric,
  iva_pct      numeric not null default 23,
  estado       text not null default 'rascunho',     -- rascunho|enviada|aceite|recusada|esclarecimento|produzida|faturada
  token        text unique,
  decisao_nota text,
  aceite_em    timestamptz,
  autor_id     uuid references auth.users(id),
  criado_em    timestamptz not null default now()
);

create index if not exists ordens_cliente_idx on ordens_alteracao (cliente_id, criado_em desc);

alter table ordens_alteracao enable row level security;
drop policy if exists ordens_auth_all on ordens_alteracao;
-- Operador (autenticado): tudo.
create policy ordens_auth_all on ordens_alteracao for all to authenticated using (true) with check (true);
