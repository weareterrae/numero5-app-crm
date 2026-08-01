-- =====================================================================
-- Nº 5 · CRM — orgs da KoolNature / EKOOLOGY                     [0048]
-- ---------------------------------------------------------------------
-- Segue o padrão do 0046 (multi-tenant). Cria SÓ A ESTRUTURA — org +
-- funil + token de ingestão. NÃO carrega leads (esse import fica para
-- depois da validação do Nuno; "avançar com tudo" de uma vez).
--
-- Dois funis, porque são trabalhos de gente diferente:
--   · koolnature              → leads de CHURRASQUEIRAS/restaurantes de
--     brasa, trabalhadas pelos DISTRIBUIDORES (clientes da KoolNature).
--   · koolnature-recrutamento → RECRUTAR novos distribuidores, trabalho
--     da própria KoolNature (Nuno).
-- Aditivo e idempotente.
-- =====================================================================

-- --- Org 1 · Churrasqueiras (clientes dos distribuidores) -------------
do $$
declare v_org uuid;
begin
  insert into orgs (nome, slug, marca)
    values ('KoolNature · EKOOLOGY', 'koolnature', '{"cor":"#E8A13C"}'::jsonb)
    on conflict (slug) do nothing;
  select id into v_org from orgs where slug = 'koolnature';

  insert into crm_etapas (org_id, chave, titulo, ordem, tipo) values
    (v_org, 'nova',         'Nova',                     1, 'aberto'),
    (v_org, 'encaminhada',  'Encaminhada ao distribuidor', 2, 'aberto'),
    (v_org, 'contactada',   'Contactada',               3, 'aberto'),
    (v_org, 'negociacao',   'Em negociação',            4, 'aberto'),
    (v_org, 'cliente',      'Cliente',                  5, 'ganho'),
    (v_org, 'sem_interesse','Sem interesse',            6, 'perdido')
  on conflict (org_id, chave) do nothing;

  if not exists (select 1 from org_tokens where org_id = v_org) then
    insert into org_tokens (org_id, nome) values (v_org, 'Site (Chef Kool) + Meta Instant Form');
  end if;
end $$;

-- --- Org 2 · Recrutamento de distribuidores (trabalho da KoolNature) --
do $$
declare v_org uuid;
begin
  insert into orgs (nome, slug, marca)
    values ('KoolNature — Recrutamento de Distribuidores', 'koolnature-recrutamento', '{"cor":"#B4761A"}'::jsonb)
    on conflict (slug) do nothing;
  select id into v_org from orgs where slug = 'koolnature-recrutamento';

  insert into crm_etapas (org_id, chave, titulo, ordem, tipo) values
    (v_org, 'nova',         'Nova',               1, 'aberto'),
    (v_org, 'abordado',     'Abordado',           2, 'aberto'),
    (v_org, 'interessado',  'Interessado',        3, 'aberto'),
    (v_org, 'negociacao',   'Em negociação',      4, 'aberto'),
    (v_org, 'ativo',        'Distribuidor ativo', 5, 'ganho'),
    (v_org, 'sem_interesse','Sem interesse',      6, 'perdido')
  on conflict (org_id, chave) do nothing;

  if not exists (select 1 from org_tokens where org_id = v_org) then
    insert into org_tokens (org_id, nome) values (v_org, 'Campanha B2B «Seja distribuidor»');
  end if;
end $$;
