-- 0027_reunioes.sql
-- Fase 2, Bloco 2 — Reuniões. Regras configuráveis + registo de cada reunião,
-- com horas reais que entram na rentabilidade do cliente.

create table if not exists reunioes (
  id                   uuid primary key default gen_random_uuid(),
  cliente_id           uuid not null references clientes(id) on delete cascade,
  data                 date not null default current_date,
  duracao_planeada_min integer,
  duracao_real_min     integer,
  participantes        text,
  objetivo             text,
  decisoes             text,
  tarefas              text,           -- tarefas, responsáveis e prazos (texto livre)
  formato              text not null default 'online',   -- online | presencial
  incluida             boolean not null default true,    -- incluída no plano ou extra
  faturar              boolean not null default false,   -- extra que precisa de faturação
  faturada             boolean not null default false,
  notas                text,
  autor_id             uuid references auth.users(id),
  criado_em            timestamptz not null default now()
);

create index if not exists reunioes_cliente_idx on reunioes (cliente_id, data desc);

alter table reunioes enable row level security;
drop policy if exists reunioes_auth_all on reunioes;
create policy reunioes_auth_all on reunioes for all to authenticated using (true) with check (true);

-- Parâmetros globais (predefinição; podem ser afinados por plano no futuro).
insert into configuracoes (chave, valor, descricao) values
  ('reunioes_incluidas',     null, 'Reuniões incluídas por mês na avença. [A DEFINIR]'),
  ('duracao_reuniao_min',    null, 'Duração máxima de cada reunião, em minutos. [A DEFINIR]'),
  ('preco_reuniao_extra',    null, 'Preço de uma reunião adicional (€). [A DEFINIR]'),
  ('suplemento_presencial',  null, 'Suplemento por reunião presencial (€). [A DEFINIR]'),
  ('reuniao_pct_alerta',     '20', 'Alertar quando o tempo de reunião passa esta % das horas contratadas.')
on conflict (chave) do nothing;
