-- 0043_manutencao_editorial.sql
-- Fase 2, Prioridade 2 — Manutenção de sites em duas linhas (Partes 35-36):
-- técnica (a existente `manutencao_site`) e editorial (nova).

update precos_unitarios
  set rotulo = 'Manutenção técnica do site', rotulo_en = 'Technical website maintenance'
  where chave = 'manutencao_site';

insert into precos_unitarios
  (chave, rotulo, rotulo_en, tipo, unidade, categoria, preco, custo_interno,
   tempo_planeado_min, estado, mostrar_discriminado, descricao_interna, ordem)
values
  ('manutencao_editorial', 'Manutenção editorial do site', 'Editorial website maintenance',
   'mensal', 'mês', 'Site', 45, 12, 45, 'ativo', true,
   'Alterações de texto, troca de imagens, atualização de informação, campanhas temporárias — dentro de um limite de horas/alterações combinado.', 6)
on conflict (chave) do nothing;
