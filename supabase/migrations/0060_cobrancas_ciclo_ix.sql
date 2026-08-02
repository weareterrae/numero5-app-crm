-- 0060 — Ciclo fiscal completo na cobrança: fatura emitida (número + PDF),
-- recibo ao receber, nota de crédito para corrigir. Tudo InvoiceXpress.

alter table cobrancas add column if not exists fatura_ix_numero text;  -- ex.: FT 2026/123
alter table cobrancas add column if not exists fatura_ix_pdf text;     -- URL do PDF gerado
alter table cobrancas add column if not exists recibo_ix_id bigint;
alter table cobrancas add column if not exists recibo_ix_url text;
alter table cobrancas add column if not exists recibo_ix_pdf text;
alter table cobrancas add column if not exists nc_ix_id bigint;        -- nota de crédito (rascunho no IX)
alter table cobrancas add column if not exists nc_ix_url text;
