-- =====================================================================
-- Nº 5 · CRM — alertas de leads por responder                    [0047]
-- Cada org pode ter um email de alerta e um limiar (min) de arrefecimento.
-- =====================================================================
alter table orgs add column if not exists alerta_email   text;
alter table orgs add column if not exists alerta_minutos  int not null default 30;

-- Pré-configura o Externato para avisar a Bruna.
update orgs
   set alerta_email = coalesce(alerta_email, 'geral@externatosantamariadebelem.com')
 where slug = 'externato-smb';
