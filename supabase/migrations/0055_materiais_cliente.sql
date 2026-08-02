-- 0055 — Biblioteca do cliente: materiais que o cliente carrega na Sede
-- (logótipos, fotos, vídeos, documentos). Ficheiros no bucket privado
-- 'materiais' (0044); acesso só por URL assinado gerado no servidor.

create table if not exists materiais_cliente (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references clientes(id) on delete cascade,
  nome text not null,
  caminho text not null,      -- path dentro do bucket 'materiais'
  tipo text,                  -- mime
  tamanho bigint,
  autor_id uuid references auth.users(id),
  criado_em timestamptz not null default now()
);

create index if not exists materiais_cliente_idx on materiais_cliente (cliente_id, criado_em desc);

alter table materiais_cliente enable row level security;
-- Interna (keyed a clientes): staff via RLS; Sede via service-role filtrado por cliente.
create policy materiais_cliente_auth_all on materiais_cliente for all to authenticated using (true) with check (true);

comment on table materiais_cliente is 'Materiais carregados pelo cliente na Sede (bucket materiais). Download por URL assinado.';
