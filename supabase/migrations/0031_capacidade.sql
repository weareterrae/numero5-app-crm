-- 0031_capacidade.sql
-- Fase 2, Bloco 7 — Capacidade da operação. Nem todas as horas de calendário
-- são produtivas: uma fatia é reservada para trabalho não faturável (vendas,
-- administração, desenvolvimento do Nº 5, imprevistos).

insert into configuracoes (chave, valor, descricao) values
  ('horas_mes_total', null, 'Horas totais disponíveis por mês na operação. [A DEFINIR]'),
  ('pct_nao_faturavel', null, 'Percentagem de capacidade reservada para trabalho não faturável (sugestão 30–40%). [A DEFINIR]')
on conflict (chave) do nothing;
