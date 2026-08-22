-- =====================================================================
-- N5 AI OS · saída estruturada e prompt dinâmico            [0078]
-- ---------------------------------------------------------------------
-- Vem de estudar a Academia Terrae (onde os consultores se formam) e
-- confirma um padrão que já se via no Mestre e na Terrae:
--
--   TODOS os assistentes a sério têm um modo estruturado além da
--   conversa. O Mestre resume leads, a Academia PONTUA consultores,
--   a Terrae devolve diagnósticos. Sem JSON garantido, esses modos
--   devolvem prosa e falham em SILÊNCIO — o JSON.parse do chamador
--   rebenta ou, pior, devolve lixo que ninguém valida.
--
-- Eu tinha deixado isto para P1. Estava errado: é P0.
--
-- Segundo problema: a Academia constrói o system NA HORA a partir dos
-- dados do cenário (personaSystem(sc), evalSystem(sc)). Não é um prompt
-- fixo que possa viver no registo. Precisa de o poder enviar.
--
-- Isso é um poder perigoso — quem envia o system controla o assistente.
-- Por isso NÃO é geral: exige marca explícita por assistente, e só vale
-- para chamadas servidor-a-servidor (o browser nunca chega aqui, porque
-- a origem é validada e a chave do site é pública).
-- =====================================================================

alter table ai_assistants
  add column if not exists permite_system_dinamico boolean not null default false,
  add column if not exists permite_json            boolean not null default false;

comment on column ai_assistants.permite_system_dinamico is
  'Autoriza o chamador a enviar o system prompt. Só para assistentes cujo prompt é gerado a partir de dados (ex.: cenários da Academia). Perigoso por omissão — fica desligado.';
comment on column ai_assistants.permite_json is
  'Autoriza pedidos com saída estruturada (JSON). Necessário a modos de avaliação/diagnóstico.';

-- Registar se o pedido usou cada um destes modos, para se poder auditar.
alter table ai_requests
  add column if not exists system_dinamico boolean not null default false,
  add column if not exists json_mode       boolean not null default false;

comment on column ai_requests.system_dinamico is
  'O system veio do chamador, não do registo. Auditável.';

insert into schema_migrations (version) values ('0078')
on conflict (version) do nothing;
