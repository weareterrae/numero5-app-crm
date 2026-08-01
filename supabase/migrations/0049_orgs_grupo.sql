-- =====================================================================
-- Nº 5 · CRM — "grupo" nas orgs (1 cliente → vários quadros/funis)  [0049]
-- ---------------------------------------------------------------------
-- Multi-quadro sem refazer o modelo: cada org continua a ser um QUADRO
-- (funil + RLS próprios). Orgs com o mesmo `grupo` são o MESMO cliente
-- da agência e aparecem agrupadas no dashboard "Leads dos clientes".
-- `grupo` NULL → a org agrupa sob o seu próprio nome (cliente de 1 quadro).
-- Aditivo e idempotente.
-- =====================================================================

alter table orgs add column if not exists grupo text;

-- A KoolNature é 1 cliente com 2 quadros (churrasqueiras + recrutamento).
update orgs set grupo = 'KoolNature'
where slug in ('koolnature', 'koolnature-recrutamento');
