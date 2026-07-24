-- =====================================================================
-- Nº 5 · Folha de produção mensal por cliente
--
-- Uma coisa é o planeado (o que está contratado na avença), outra é o
-- que o cliente vai pedindo pelo caminho. Sem registo, os extras fazem-se
-- de graça e as horas nunca se sabem.
--
-- O PLANEADO não se duplica aqui: vem do âmbito da proposta aceite.
-- Esta tabela regista o que foi mesmo PRODUZIDO.
-- Correr no SQL Editor do Supabase. Seguro de correr novamente.
-- =====================================================================

create table if not exists producao_itens (
  id          uuid primary key default gen_random_uuid(),
  cliente_id  uuid not null references clientes(id) on delete cascade,
  -- Mês a que pertence, sempre no dia 1 (ex.: 2026-07-01).
  mes         date not null,
  tipo        text not null check (tipo in ('post','carrossel','reel','story','anuncio','site','reuniao','outro')),
  descricao   text,
  quantidade  int  not null default 1 check (quantidade > 0),
  minutos     int  check (minutos >= 0),
  -- Fora do que estava contratado: é o que há para cobrar a mais.
  extra       boolean not null default false,
  valor       numeric(10,2),          -- só faz sentido nos extras
  faturado    boolean not null default false,
  data        date not null default current_date,
  autor_id    uuid references profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);

create index if not exists producao_cliente_mes_idx on producao_itens (cliente_id, mes);
create index if not exists producao_extras_idx on producao_itens (cliente_id, extra, faturado)
  where extra = true;

alter table producao_itens enable row level security;
drop policy if exists producao_auth_all on producao_itens;
create policy producao_auth_all on producao_itens
  for all to authenticated using (true) with check (true);
