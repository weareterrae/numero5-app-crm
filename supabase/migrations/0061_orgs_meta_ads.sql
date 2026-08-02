-- 0061 — Anúncios na Sede: liga cada org (marca) à sua conta de anúncios Meta.
-- Só o ID da conta (não é segredo). O token é UM, do Business Manager do Nº 5,
-- e vive no Netlify (META_ADS_TOKEN) — nunca na base nem no código.

alter table orgs add column if not exists meta_ads_id text;  -- ex.: 1947956182572668 (sem o "act_")

comment on column orgs.meta_ads_id is 'ID da conta de anúncios Meta desta marca (mostra campanhas na Sede).';
