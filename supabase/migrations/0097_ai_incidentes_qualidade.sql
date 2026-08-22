-- =====================================================================
-- 0097 · Uma nota de qualidade não é uma avaria de modelo
-- ---------------------------------------------------------------------
-- A fila tinha 41 incidentes abertos. Vinte e nove eram do tipo
-- MODEL_UNHEALTHY — e diziam coisas como:
--
--   «Qualidade: terrae-diagnosticos teve 0/5 em "não inventa números"»
--
-- Isso não é um modelo doente. É um prompt a falhar um critério. São
-- problemas diferentes, com donos diferentes e prazos diferentes:
--
--   um modelo em baixo   resolve-se sozinho, e o disjuntor trata disso
--   um prompt a falhar   não se resolve sozinho, e é trabalho de alguém
--
-- Misturá-los foi o que tornou a fila ilegível. Vinte e nove notas de
-- qualidade a fazerem-se passar por avarias enterravam as dez avarias a
-- sério, e o resultado foi ninguém ler nenhuma das duas coisas.
--
-- Passa a haver um tipo próprio. E as que já lá estavam são
-- reclassificadas pelo que dizem de si próprias — não é adivinhação, o
-- título começa por «Qualidade:».
-- =====================================================================

alter table ai_incidents drop constraint if exists ai_incidents_tipo_check;
alter table ai_incidents add constraint ai_incidents_tipo_check check (tipo in (
  'PROVIDER_UNHEALTHY', 'MODEL_UNHEALTHY', 'HIGH_ERROR_RATE',
  'BUDGET_SOFT', 'BUDGET_CRITICAL', 'BUDGET_EXHAUSTED',
  'CIRCUIT_OPEN', 'TRAFFIC_SPIKE', 'MODEL_DEPRECATED',
  -- Novo: a resposta saiu, mas não estava à altura.
  'QUALITY_LOW'));

update ai_incidents set tipo = 'QUALITY_LOW'
 where tipo = 'MODEL_UNHEALTHY' and titulo like 'Qualidade:%';

-- ---------------------------------------------------------------------
-- Fechar o que está mesmo resolvido, e SÓ isso
-- ---------------------------------------------------------------------
-- Os disjuntores que abriram durante o dia recuperaram sozinhos: à hora
-- desta migração os oito modelos ligados estão HEALTHY e todos os
-- disjuntores CLOSED. Foi verificado antes de se escrever isto, não
-- presumido.
--
-- Fecham-se por terem sido VISTOS e o sistema ter recuperado — que é o
-- que «resolvido» quer dizer aqui. Não se apaga nada: a prova de que
-- houve falha fica, com a data.
--
-- As de QUALITY_LOW ficam ABERTAS de propósito. Um 0/5 não se cura com o
-- tempo, e fechá-lo agora seria varrer a lista de trabalho para debaixo
-- do tapete no mesmo dia em que a criámos.
update ai_incidents
   set resolvido = true,
       resolvido_em = now(),
       detalhe = coalesce(detalhe, '{}'::jsonb) || jsonb_build_object(
         'fecho', 'Revistos em conjunto a 22-08-2026. O sistema recuperou '
                  'sozinho em todos: à data do fecho, os 8 modelos ligados '
                  'estavam HEALTHY e todos os disjuntores CLOSED. Sem '
                  'impacto conhecido em clientes.')
 where resolvido = false
   and tipo in ('CIRCUIT_OPEN', 'HIGH_ERROR_RATE', 'MODEL_UNHEALTHY');

-- Para o painel poder mostrar as duas famílias lado a lado sem as somar.
create index if not exists ai_incidents_abertos
  on ai_incidents (tipo, created_at desc) where resolvido = false;
