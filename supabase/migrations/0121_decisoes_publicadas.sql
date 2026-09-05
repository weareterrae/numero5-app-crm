-- 0121 · Prestar contas: decisões publicadas na marca pessoal (e noutras marcas), com data de revisão e resultado.
-- Uma decisão publicada volta ao feed 3 a 6 meses depois. Aplicada em produção a 5 Set 2026.

create table if not exists public.decisoes_publicadas (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  plano_id uuid references public.planos(id) on delete set null,
  data_publicacao date not null,
  canal text not null default 'linkedin+instagram',
  titulo text not null,
  decisao text not null,
  resultado_esperado text,
  data_revisao date not null,
  resultado text,
  followup_plano_id uuid references public.planos(id) on delete set null,
  followup_data date,
  estado text not null default 'aberta' check (estado in ('aberta','revista','publicada','fechada')),
  notas text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists decisoes_publicadas_cliente_revisao on public.decisoes_publicadas (cliente_id, data_revisao);

alter table public.decisoes_publicadas enable row level security;
drop policy if exists decisoes_publicadas_staff on public.decisoes_publicadas;
create policy decisoes_publicadas_staff on public.decisoes_publicadas
  for all to authenticated using (n5_is_staff()) with check (n5_is_staff());

comment on table public.decisoes_publicadas is 'Prestar contas: decisões publicadas, com data de revisão e resultado. Uma decisão publicada volta ao feed 3 a 6 meses depois.';

insert into public.schema_migrations (version, applied_at) values ('0121', now()) on conflict do nothing;
