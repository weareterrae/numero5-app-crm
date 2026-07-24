-- =====================================================================
-- Nº 5 · Planos de publicações mensais, partilhados com o cliente
--
-- Produzidos no Claude Code (HTML), colados na ficha do cliente,
-- partilhados por link com a marca, e o cliente aprova / pede alteração
-- / recusa. Fica tudo registado. Liga ao ritmo mensal da proposta
-- (plano até dia 15, 5 dias para ajustes).
-- Correr no SQL Editor do Supabase. Seguro de correr novamente.
-- =====================================================================

create table if not exists planos (
  id             uuid primary key default gen_random_uuid(),
  cliente_id     uuid not null references clientes(id) on delete cascade,
  mes            date not null,                     -- 1.º dia do mês do plano
  titulo         text,
  conteudo_html  text not null default '',          -- o plano, em HTML
  estado         text not null default 'rascunho'
                   check (estado in ('rascunho','enviado','aprovado','alteracoes','recusado')),
  partilha_token uuid unique default gen_random_uuid(),
  partilha_ativa boolean not null default false,
  enviado_em     timestamptz,
  decidido_em    timestamptz,
  nota_cliente   text,                              -- o que o cliente escreveu ao decidir
  criado_por     uuid references profiles(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists planos_cliente_idx on planos (cliente_id, mes desc);

drop trigger if exists planos_updated on planos;
create trigger planos_updated before update on planos
  for each row execute function set_updated_at();

alter table planos enable row level security;
drop policy if exists planos_auth_all on planos;
create policy planos_auth_all on planos for all to authenticated using (true) with check (true);
