-- 0058 — Token de captação por org: um formulário público que alimenta as
-- Leads da Sede diretamente (o cliente partilha o link ou embebe no site dele).

alter table orgs add column if not exists captura_token uuid not null default gen_random_uuid();
create unique index if not exists orgs_captura_token_idx on orgs (captura_token);
