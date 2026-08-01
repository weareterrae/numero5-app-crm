-- 0045_planos_arquivado.sql
-- Campo "arquivado" nos planos: esconde anexos da lista interna do cliente
-- sem os apagar (o link público /r/plano continua a funcionar).
-- Arquiva de imediato os 4 anexos da apresentação-mãe da KoolNature.

alter table planos add column if not exists arquivado boolean not null default false;

update planos set arquivado = true
where partilha_token in (
  '50b8d473-ab63-41a6-9bb4-01ae9975f500',  -- Estratégia de Distribuição Nacional
  '0353605e-a440-4f40-886e-ad36ec495d8a',  -- Mapa de Cobertura e Reforço (308 concelhos)
  'feea54fe-af6f-4e95-bb89-aae116dcdc8c',  -- Pack de Prospeção — Churrasqueiras
  'c89244b4-b357-444c-bc47-d7fc13fa00ab'   -- Candidatos a Distribuidor (amostra)
);
