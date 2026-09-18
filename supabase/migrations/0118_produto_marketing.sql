-- =====================================================================
-- 0118 — módulo de Marketing (Número Cinco)
-- ---------------------------------------------------------------------
-- Diferente dos outros módulos do schema `produto` (copiados da base de
-- dados viva da Quente e Bom): este é NOVO, desenhado de raiz. Não é o
-- que a Quente e Bom faz para si própria — é o que a Nº 5 faz para cada
-- empresa-cliente: planos mensais de conteúdo para redes sociais,
-- projetos de site, e os resultados reais desse trabalho.
--
-- Quatro tabelas, todas por `empresa_id` como as restantes do schema:
--   planos_mensais    — um por empresa por mês (objetivo + estado)
--   publicacoes       — cada peça de conteúdo dentro de um plano
--   projetos_site     — trabalho de site, à parte do calendário mensal
--   resultados_mensais — os números reais do mês (hoje vindos do Metricool)
-- =====================================================================

create table if not exists produto.planos_mensais (
  id         uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references produto.empresas(id),
  mes        date not null, -- primeiro dia do mês, ex. 2026-08-01
  objetivo   text,
  estado     text not null default 'rascunho', -- rascunho | aprovado | em_execucao | fechado
  criado_em  timestamptz not null default now(),
  unique (empresa_id, mes)
);

create table if not exists produto.publicacoes (
  id             uuid primary key default gen_random_uuid(),
  empresa_id     uuid not null references produto.empresas(id),
  plano_id       uuid not null references produto.planos_mensais(id) on delete cascade,
  data           date,
  rede           text, -- instagram | facebook | tiktok | linkedin | site...
  formato        text, -- post | story | reel | carrossel | artigo
  legenda        text,
  notas_visuais  text,
  estado         text not null default 'rascunho', -- rascunho | em_aprovacao | agendado | publicado
  ordem          int not null default 0,
  criado_em      timestamptz not null default now()
);

create table if not exists produto.projetos_site (
  id             uuid primary key default gen_random_uuid(),
  empresa_id     uuid not null references produto.empresas(id),
  nome           text not null,
  descricao      text,
  estado         text not null default 'planeamento', -- planeamento | em_curso | revisao | concluido
  data_inicio    date,
  data_prevista  date,
  criado_em      timestamptz not null default now()
);

create table if not exists produto.resultados_mensais (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references produto.empresas(id),
  mes         date not null,
  alcance     int,
  seguidores  int,
  engagement  numeric,
  notas       text,
  criado_em   timestamptz not null default now(),
  unique (empresa_id, mes)
);

alter table produto.planos_mensais enable row level security;
drop policy if exists planos_mensais_isolamento_empresa on produto.planos_mensais;
create policy planos_mensais_isolamento_empresa on produto.planos_mensais
  using (empresa_id::text = current_setting('app.empresa_id', true));

alter table produto.publicacoes enable row level security;
drop policy if exists publicacoes_isolamento_empresa on produto.publicacoes;
create policy publicacoes_isolamento_empresa on produto.publicacoes
  using (empresa_id::text = current_setting('app.empresa_id', true));

alter table produto.projetos_site enable row level security;
drop policy if exists projetos_site_isolamento_empresa on produto.projetos_site;
create policy projetos_site_isolamento_empresa on produto.projetos_site
  using (empresa_id::text = current_setting('app.empresa_id', true));

alter table produto.resultados_mensais enable row level security;
drop policy if exists resultados_mensais_isolamento_empresa on produto.resultados_mensais;
create policy resultados_mensais_isolamento_empresa on produto.resultados_mensais
  using (empresa_id::text = current_setting('app.empresa_id', true));
