-- =====================================================================
-- Nº 5 · Descontos transparentes (investimento na relação)
--
-- Um preço nunca é "substituído" por um valor menor sem explicação. Um
-- desconto guarda o valor normal, o tipo, a duração, o preço durante e
-- depois, o motivo e quem autorizou. Ao terminar, prepara a cobrança pelo
-- valor normal — nunca altera faturas já emitidas.
-- Correr no SQL Editor do Supabase. Seguro de correr novamente.
-- =====================================================================

create table if not exists descontos (
  id             uuid primary key default gen_random_uuid(),
  cliente_id     uuid not null references clientes(id) on delete cascade,
  proposta_id    uuid references propostas(id) on delete set null,
  alvo           text not null default 'avenca' check (alvo in ('avenca', 'setup')),
  valor_normal   numeric not null default 0,
  tipo           text not null default 'percentagem' check (tipo in ('percentagem', 'fixo')),
  valor_desconto numeric not null default 0,
  preco_durante  numeric,
  preco_apos     numeric,
  motivo         text,
  inicio         date,
  duracao_meses  int,
  fim            date,
  estado         text not null default 'ativo' check (estado in ('ativo', 'terminado')),
  autor_id       uuid references profiles(id) on delete set null,
  notas          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists descontos_cliente_idx on descontos (cliente_id);
create index if not exists descontos_fim_idx on descontos (fim) where estado = 'ativo';

drop trigger if exists descontos_updated on descontos;
create trigger descontos_updated before update on descontos
  for each row execute function set_updated_at();

alter table descontos enable row level security;
drop policy if exists descontos_auth_all on descontos;
create policy descontos_auth_all on descontos for all to authenticated using (true) with check (true);
