-- 0035_diagnostico_analise.sql
-- Melhorar o diagnóstico — Fase 4: análise interna. As oportunidades, a
-- adequação e as lacunas são CALCULADAS a partir do brief (não se guardam);
-- aqui guarda-se só o que o operador edita à mão: o resumo e as notas.

alter table diagnosticos
  add column if not exists analise jsonb not null default '{}'::jsonb;

comment on column diagnosticos.analise is
  'Análise editada pelo operador: { resumo, notas }. As oportunidades/adequação/lacunas são derivadas do brief em tempo real.';
