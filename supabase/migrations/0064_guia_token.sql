-- Nº 5 · Token público do Guia da Marca
-- Permite preencher o guia por link (sem login) — ex.: marcas novas ainda sem Sede.
-- Página pública /guia/[token]; resolve o cliente por este token (service-role).
alter table clientes add column if not exists guia_token uuid unique default gen_random_uuid();

-- Garante token para as fichas já existentes.
update clientes set guia_token = gen_random_uuid() where guia_token is null;
