-- =====================================================================
-- Nº 5 · Cobranças — o dinheiro que entra, mês a mês
--
-- Para cada mês, sabes que avenças estão cobradas e quais estão por cobrar.
-- Uma linha por cliente/mês/tipo. A avença cria a linha ao marcares; a
-- ausência de linha = ainda por cobrar. Fecha o ciclo: do contratado ao
-- recebido.
-- Correr no SQL Editor do Supabase. Seguro de correr novamente.
-- =====================================================================

create table if not exists cobrancas (
  id          uuid primary key default gen_random_uuid(),
  cliente_id  uuid not null references clientes(id) on delete cascade,
  mes         date not null,                    -- 1.º dia do mês
  tipo        text not null default 'avenca' check (tipo in ('avenca','extra','setup','outro')),
  descricao   text,
  valor       numeric not null default 0,
  estado      text not null default 'por_cobrar' check (estado in ('por_cobrar','cobrado')),
  cobrado_em  timestamptz,
  criado_por  uuid references profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (cliente_id, mes, tipo)
);
create index if not exists cobrancas_mes_idx on cobrancas (mes desc);

drop trigger if exists cobrancas_updated on cobrancas;
create trigger cobrancas_updated before update on cobrancas
  for each row execute function set_updated_at();

alter table cobrancas enable row level security;
drop policy if exists cobrancas_auth_all on cobrancas;
create policy cobrancas_auth_all on cobrancas for all to authenticated using (true) with check (true);
