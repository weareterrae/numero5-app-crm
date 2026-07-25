-- 0029_revisoes.sql
-- Fase 2, Bloco 4 — Revisões e retrabalho. Três classificações:
--   correcao   → erro do Nº 5, NÃO consome a ronda incluída;
--   alteracao  → mudança do cliente dentro do briefing, consome ronda;
--   retrabalho → mudança estrutural após aprovação, é trabalho adicional.
-- Uma ronda = conjunto consolidado de alterações sobre a MESMA versão.

create table if not exists revisoes (
  id           uuid primary key default gen_random_uuid(),
  cliente_id   uuid not null references clientes(id) on delete cascade,
  peca         text not null,                       -- a que peça se refere
  versao       integer not null default 1,
  tipo         text not null default 'alteracao',   -- correcao | alteracao | retrabalho
  data         date not null default current_date,
  pedido       text,                                -- o que o cliente pediu
  origem       text,                                -- email, WhatsApp, reunião...
  horas        numeric,
  incluido     boolean not null default true,       -- dentro do incluído ou extra
  valor        numeric,                             -- valor a cobrar, se extra
  faturada     boolean not null default false,
  responsavel  text,
  autor_id     uuid references auth.users(id),
  criado_em    timestamptz not null default now()
);

create index if not exists revisoes_cliente_idx on revisoes (cliente_id, peca, data desc);

alter table revisoes enable row level security;
drop policy if exists revisoes_auth_all on revisoes;
create policy revisoes_auth_all on revisoes for all to authenticated using (true) with check (true);

insert into configuracoes (chave, valor, descricao) values
  ('revisoes_incluidas', null, 'Rondas de alterações incluídas por peça. [A DEFINIR]'),
  ('janela_ronda_horas', '48', 'Janela (horas) para consolidar pedidos dispersos na mesma ronda.')
on conflict (chave) do nothing;
