-- 0059 — Ligação das cobranças ao InvoiceXpress (fatura certificada).
-- A app cria a fatura em RASCUNHO no InvoiceXpress e guarda aqui a referência;
-- a finalização (número legal/AT) faz-se no InvoiceXpress com revisão humana.

alter table cobrancas add column if not exists fatura_ix_id bigint;
alter table cobrancas add column if not exists fatura_ix_url text;
alter table cobrancas add column if not exists fatura_ix_estado text; -- draft | final | ...
