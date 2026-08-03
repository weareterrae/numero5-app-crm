-- =====================================================================
-- Nº 5 · Métricas de marca + Radar de comunicação
--
-- Duas peças de uma só fundação:
--  1) marca_metricas  — "fotografias" diárias dos números do Metricool
--     (seguidores/alcance/interações/visitas por rede). A app e a Sede
--     só MOSTRAM; quem escreve é o motor (Claude Code, job diário).
--  2) marca_comunicacao — estado de vigilância por marca (em dia / a
--     ficar curto / falhou) + o que vem agendado e o que falhou. Alimenta
--     o "O meu dia" do Quinto e um sinal por marca no operador.
--
-- Correr no SQL Editor do Supabase. Seguro de correr novamente.
-- =====================================================================

-- 1) SNAPSHOTS DE MÉTRICAS ------------------------------------------------
create table if not exists marca_metricas (
  id           uuid primary key default gen_random_uuid(),
  cliente_id   uuid not null references clientes(id) on delete cascade,
  data         date not null,                 -- dia da fotografia
  rede         text not null,                 -- instagram|facebook|linkedin|tiktok|youtube|gbp|web|ads|global
  seguidores   integer,                       -- total atual da rede
  ganho        integer,                       -- variação de seguidores no período
  alcance      bigint,                        -- alcance do período
  impressoes   bigint,
  interacoes   bigint,                        -- gostos+comentários+partilhas+guardados
  visitas      bigint,                        -- sessões/visitantes do site (web)
  publicacoes  integer,                       -- nº de publicações no período
  extra        jsonb not null default '{}',   -- o que for específico da rede
  periodo_ini  date,
  periodo_fim  date,
  capturado_em timestamptz not null default now(),
  unique (cliente_id, rede, data)
);
create index if not exists marca_metricas_cli_idx on marca_metricas (cliente_id, data desc);

alter table marca_metricas enable row level security;
drop policy if exists marca_metricas_auth_all on marca_metricas;
create policy marca_metricas_auth_all on marca_metricas for all to authenticated using (true) with check (true);

-- 2) ESTADO DE COMUNICAÇÃO (Radar) ---------------------------------------
create table if not exists marca_comunicacao (
  cliente_id     uuid primary key references clientes(id) on delete cascade,
  estado         text not null default 'cinzento'
                   check (estado in ('verde','amarelo','vermelho','cinzento')),
  dias_cobertos  integer,               -- dias seguidos com feed agendado a partir de hoje
  proximo_post   date,                  -- data do próximo feed agendado
  agendados      jsonb not null default '[]',  -- [{data, tipo, rede}] próximos ~14 dias
  falhas         jsonb not null default '[]',  -- [{data, rede, motivo, url}]
  metricool_blog_id text,
  resumo         text,                  -- frase curta pronta para o Quinto
  atualizado_em  timestamptz not null default now()
);

alter table marca_comunicacao enable row level security;
drop policy if exists marca_comunicacao_auth_all on marca_comunicacao;
create policy marca_comunicacao_auth_all on marca_comunicacao for all to authenticated using (true) with check (true);
