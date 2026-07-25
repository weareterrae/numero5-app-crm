-- 0041_fiscal_sla.sql
-- Fase 2, Prioridade 3 — Fiscalidade e SLA configuráveis. Nada de regras fiscais
-- presumidas: a taxa de IVA e a moeda ficam em configuracoes. SLA indicativo,
-- nunca disponibilidade permanente.

insert into configuracoes (chave, valor, descricao) values
  ('iva_taxa', '23', 'Taxa de IVA (%) por defeito nas ordens e propostas.'),
  ('moeda', 'EUR', 'Moeda por defeito (EUR). Angola/AOA a preparar por catálogo.'),
  ('sla_horario', null, 'Horário da operação (ex.: 9h–18h, dias úteis). [A DEFINIR]'),
  ('sla_resposta', null, 'Prazo indicativo de resposta a pedidos normais. [A DEFINIR]'),
  ('sla_urgencia', null, 'Prazo indicativo para urgências. [A DEFINIR]')
on conflict (chave) do nothing;
