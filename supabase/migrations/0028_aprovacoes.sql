-- 0028_aprovacoes.sql
-- Fase 2, Bloco 3 — Aprovações. Quem aprova (na ficha) + fluxo de aprovação por
-- conteúdo, sem aprovação tácita. Nada é publicado sem aprovação expressa.

-- Quem aprova, na ficha do cliente (jsonb tolerante: responsavel, suplente,
-- email, telefone, prazo_dias, canais, validacao_juridica, validacao_tecnica,
-- decisores).
alter table clientes
  add column if not exists aprovacao jsonb not null default '{}'::jsonb;

comment on column clientes.aprovacao is
  'Responsável pela aprovação e regras: { responsavel, suplente, email, telefone, prazo_dias, canais, validacao_juridica, validacao_tecnica, decisores }.';

create table if not exists aprovacoes (
  id             uuid primary key default gen_random_uuid(),
  cliente_id     uuid not null references clientes(id) on delete cascade,
  titulo         text not null,
  canal          text,                              -- email | whatsapp | plano | ...
  enviado_em     timestamptz not null default now(),
  prazo          date,
  estado         text not null default 'pendente',  -- pendente|aprovado|alteracoes|recusado|sem_resposta
  resolvido_em   timestamptz,
  lembretes      integer not null default 0,
  atraso_cliente boolean not null default false,
  nota           text,
  autor_id       uuid references auth.users(id),
  criado_em      timestamptz not null default now()
);

create index if not exists aprovacoes_cliente_idx on aprovacoes (cliente_id, enviado_em desc);

alter table aprovacoes enable row level security;
drop policy if exists aprovacoes_auth_all on aprovacoes;
create policy aprovacoes_auth_all on aprovacoes for all to authenticated using (true) with check (true);
