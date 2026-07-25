-- 0026_direcao_coordenacao.sql
-- Fase 2, Bloco 1 — Direção e coordenação de marketing.
-- Serviço mensal obrigatório em qualquer avença: planeamento, prioridades,
-- calendário, direção estratégica/criativa, coordenação da produção, reuniões,
-- acompanhamento de aprovações e comunicação com o cliente. Pode ficar agregado
-- comercialmente ao Motor (mostrar_discriminado = false) — não aparece como
-- linha na proposta do cliente, mas entra no preço e nas horas internas.

insert into precos_unitarios
  (chave, rotulo, rotulo_en, tipo, unidade, categoria, preco, estado,
   mostrar_discriminado, descricao_interna, permite_desconto, ordem)
values
  ('direcao', 'Direção e coordenação de marketing', 'Marketing direction & coordination',
   'mensal', 'mês', 'Gestão', null, 'a_definir',
   false,
   'Planeamento mensal, prioridades, calendário editorial, análise do negócio, direção estratégica e criativa, coordenação da produção, preparação de reuniões, acompanhamento de aprovações, comunicação regular e revisão de resultados. Preço/horas/custo interno [A DEFINIR].',
   true, 5)
on conflict (chave) do nothing;
