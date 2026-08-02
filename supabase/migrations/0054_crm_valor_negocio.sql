-- 0054 — ROI real: valor do negócio fechado a partir de cada lead.
-- Liga o marketing à receita: o cliente marca a lead como venda e o valor;
-- a Sede mostra quanto o marketing rendeu.

alter table crm_leads add column if not exists valor_negocio numeric(12, 2);
alter table crm_leads add column if not exists ganho_em timestamptz;

create index if not exists crm_leads_ganho_idx on crm_leads (org_id, ganho_em);

comment on column crm_leads.valor_negocio is 'Valor (€) do negócio fechado a partir desta lead. Preenchido quando marcada como venda.';
comment on column crm_leads.ganho_em is 'Quando a lead foi marcada como venda (para o ROI por período).';
