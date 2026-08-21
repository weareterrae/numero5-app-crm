-- =====================================================================
-- N5 AI OS · prompt do assistente separado da nota interna    [0074]
-- ---------------------------------------------------------------------
-- Bug apanhado no piloto: o gateway estava a enviar `descricao` como
-- prompt de sistema. Mas `descricao` é a nota INTERNA do assistente
-- ("Piloto do N5 AI OS, escolhido por baixo tráfego…"), não instruções
-- para o modelo. Resultado: o Mestre respondia sem personalidade e em
-- português do Brasil, porque não tinha instrução nenhuma.
--
-- Passam a ser dois campos com papéis distintos:
--   descricao     → para humanos, no painel de operações
--   system_prompt → o que vai para o modelo
--
-- Isto é o mínimo correto para o P0. O versionamento com histórico e
-- rollback (ai_prompts/ai_prompt_versions) continua a ser P1.
-- =====================================================================

alter table ai_assistants add column if not exists system_prompt text;

comment on column ai_assistants.descricao is
  'Nota interna para a equipa. NUNCA enviada ao modelo.';
comment on column ai_assistants.system_prompt is
  'Instruções enviadas ao modelo como system instruction. Sem versionamento até P1.';

insert into schema_migrations (version) values ('0074')
on conflict (version) do nothing;
