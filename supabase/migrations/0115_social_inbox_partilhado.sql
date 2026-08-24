-- =====================================================================
-- 0115 — a caixa de entrada social, partilhada por marca
-- ---------------------------------------------------------------------
-- PORQUE ISTO EXISTE
--
-- O mesmo código da moderação de comentários (`_meta-inbox`) está
-- implantado sete vezes — uma por marca — e cada implantação tinha o
-- seu próprio projecto Supabase, cada um a pagar computação própria:
--
--   aguaminda-inbox · maria-goreti-inbox · ekoology-inbox
--   quente-e-bom-bot · externato-inbox · massaprima-inbox
--   e o `pending_replies` que já vivia aqui, sem coluna nenhuma a
--   dizer de quem era — a fila da própria Nº 5.
--
-- Sete filas de mensagens idênticas, sete tabelas `buzz_config`/
-- `buzz_runs` (duas delas), ~35 $/mês só em computação a mais, para
-- fazer exactamente o que uma coluna `marca` faz de borla.
--
-- É o mesmo padrão já provado em `ai_assistants` e nos 9 clientes da
-- Sede: uma tabela, uma coluna `marca`, RLS a fechar tudo ao
-- `service_role`. Não é uma ideia nova — é o padrão de sempre, aplicado
-- a mais uma tabela.
--
-- O QUE NÃO ENTRA AQUI
--
-- `qb-digital-os` e `qb-digital-os-rh-staging` ficam de fora — dados
-- financeiros e de RH reais, sincronizados do PHC de um cliente, já
-- isolados de propósito. A `Academia Terrae` também fica de fora — tem
-- dados pessoais de formandos, não é uma fila de comentários.
-- =====================================================================

/* ---------------------------------------------------------------------
   1. `pending_replies` já existe (21 linhas, a fila da própria Nº 5).
      Ganha a coluna que sempre lhe faltou.
   --------------------------------------------------------------------- */
alter table pending_replies add column if not exists marca text;

-- As 21 linhas que já lá estavam são da própria Nº 5 — nasceram antes
-- de haver outra marca nesta tabela.
update pending_replies set marca = 'Nº 5' where marca is null;

alter table pending_replies alter column marca set not null;

comment on column pending_replies.marca is
  'Qual marca esta mensagem pertence — Água Minda, Ekoology, Externato '
  'Santa Maria de Belém, Maria Goreti, Massa Prima, Nº 5, Quente e Bom. '
  'A app é a mesma implantada sete vezes; esta coluna é o que agora as '
  'distingue, em vez de sete projectos Supabase a fazerem o mesmo.';

create index if not exists pending_replies_marca_idx on pending_replies (marca);

/* ---------------------------------------------------------------------
   2. `buzz_config` e `buzz_runs` — o impulso de publicações no Meta.
      Só a Água Minda e o Quente e Bom usam isto hoje; as outras marcas
      não têm estas tabelas nos projectos de origem. Criam-se aqui já
      com `marca`, porque uma terceira marca vai querer isto um dia e
      não se vai voltar a esta migração para o acrescentar.
   --------------------------------------------------------------------- */
create table if not exists buzz_config (
  marca text not null,
  key   text not null,
  value text,
  primary key (marca, key)
);

comment on table buzz_config is
  'Configuração do impulso de publicações (Meta Ads) por marca. '
  'Chave-valor, como nos projectos de origem — só ganhou a marca.';

create table if not exists buzz_runs (
  id            bigint generated always as identity primary key,
  marca         text not null,
  -- O id de origem, do projecto onde esta linha nasceu. As três marcas
  -- guardadas aqui vinham de bases DIFERENTES, cada uma com a sua
  -- sequência a começar em 1 — sem isto, dois `buzz_runs` de marcas
  -- diferentes podiam ter o mesmo id de origem e ninguém saberia
  -- distingui-los depois de juntos.
  origem_id     bigint,
  created_at    timestamptz not null default now(),
  status        text,
  detail        text,
  spend         numeric,
  objective     text,
  goal          text,
  budget_eur    numeric,
  post_id       text,
  adset_id      text,
  ad_id         text,
  is_video      boolean
);

comment on table buzz_runs is
  'Histórico de corridas de impulso (Meta Ads) por marca. '
  '`origem_id` é o id que a linha tinha no projecto onde nasceu — só '
  'para auditoria; o id novo é que é único aqui.';

create index if not exists buzz_config_marca_idx on buzz_config (marca);
create index if not exists buzz_runs_marca_idx on buzz_runs (marca);

alter table buzz_config enable row level security;
alter table buzz_runs enable row level security;
-- Sem políticas, como o resto da camada: só o service_role lá chega.
-- Um site nunca recebe chave de base de dados.
