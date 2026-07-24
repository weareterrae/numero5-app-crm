-- =====================================================================
-- Nº 5 · App de negócio — schema inicial
-- CRM + Diagnóstico + Propostas
-- Projeto Supabase partilhado com o bot de moderação (tabela pending_replies).
-- Nomes escolhidos para não colidir. As tabelas do protótipo
-- (n5_clientes, n5_registos) migram e são removidas no fim da transição.
-- =====================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------
-- Utilitário: manter updated_at
-- ---------------------------------------------------------------------
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ---------------------------------------------------------------------
-- 1. PROFILES — utilizadores da app (liga a auth.users)
-- ---------------------------------------------------------------------
create table if not exists profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  nome       text,
  email      text,
  papel      text not null default 'comercial' check (papel in ('admin','comercial')),
  created_at timestamptz not null default now()
);

-- cria o profile automaticamente quando nasce um utilizador
create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, email, nome)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'nome', new.email))
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ---------------------------------------------------------------------
-- 2. CLIENTES — Lead e Cliente são a mesma entidade; muda o estado
-- ---------------------------------------------------------------------
create table if not exists clientes (
  id                  uuid primary key default gen_random_uuid(),
  nome_marca          text not null,
  setor               text,
  website             text,
  redes               jsonb not null default '{}'::jsonb,
    -- {instagram,facebook,linkedin,youtube,tiktok,x,gmb,outro}
  origem              text check (origem in ('referencia','redes','organico','outbound','evento','outro')),
  estado              text not null default 'lead'
                        check (estado in ('lead','contactado','diagnostico','proposta','cliente','perdido')),
  valor_estimado      numeric(10,2),
  motivo_perda        text,
  notas_gerais        text,
  owner_id            uuid references profiles(id) on delete set null,
  ultima_interacao_at timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index if not exists clientes_estado_idx on clientes (estado);
create index if not exists clientes_setor_idx  on clientes (setor);
create index if not exists clientes_nome_idx   on clientes (lower(nome_marca));

drop trigger if exists clientes_updated on clientes;
create trigger clientes_updated before update on clientes
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------
-- 3. CONTACTOS — pessoas dentro do cliente
-- ---------------------------------------------------------------------
create table if not exists contactos (
  id         uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references clientes(id) on delete cascade,
  nome       text not null,
  cargo      text,
  email      text,
  telefone   text,
  principal  boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists contactos_cliente_idx on contactos (cliente_id);

-- ---------------------------------------------------------------------
-- 4. ATIVIDADES — histórico de interações + follow-ups agendados
-- ---------------------------------------------------------------------
create table if not exists atividades (
  id            uuid primary key default gen_random_uuid(),
  cliente_id    uuid not null references clientes(id) on delete cascade,
  autor_id      uuid references profiles(id) on delete set null,
  tipo          text not null default 'nota'
                  check (tipo in ('nota','chamada','email','reuniao','mensagem')),
  descricao     text not null,
  data          timestamptz not null default now(),
  followup_em   date,
  followup_nota text,
  concluido     boolean not null default false,
  created_at    timestamptz not null default now()
);
create index if not exists atividades_cliente_idx  on atividades (cliente_id, data desc);
create index if not exists atividades_followup_idx on atividades (followup_em)
  where followup_em is not null and concluido = false;

-- ao registar atividade, actualiza a última interação do cliente
create or replace function touch_cliente_interacao()
returns trigger language plpgsql as $$
begin
  update clientes set ultima_interacao_at = greatest(coalesce(ultima_interacao_at, new.data), new.data)
  where id = new.cliente_id;
  return new;
end $$;

drop trigger if exists atividades_touch on atividades;
create trigger atividades_touch after insert on atividades
  for each row execute function touch_cliente_interacao();

-- ---------------------------------------------------------------------
-- 5. ESTADO_HISTORICO — cada transição do funil (permite taxa de conversão)
-- ---------------------------------------------------------------------
create table if not exists estado_historico (
  id          uuid primary key default gen_random_uuid(),
  cliente_id  uuid not null references clientes(id) on delete cascade,
  de_estado   text,
  para_estado text not null,
  motivo      text,
  mudado_por  uuid references profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists estado_hist_cliente_idx on estado_historico (cliente_id, created_at);
create index if not exists estado_hist_para_idx    on estado_historico (para_estado, created_at);

create or replace function log_estado_cliente()
returns trigger language plpgsql as $$
begin
  if (tg_op = 'INSERT') then
    insert into estado_historico (cliente_id, de_estado, para_estado)
    values (new.id, null, new.estado);
  elsif (new.estado is distinct from old.estado) then
    insert into estado_historico (cliente_id, de_estado, para_estado, motivo)
    values (new.id, old.estado, new.estado,
            case when new.estado = 'perdido' then new.motivo_perda else null end);
  end if;
  return new;
end $$;

drop trigger if exists clientes_log_estado_ins on clientes;
create trigger clientes_log_estado_ins after insert on clientes
  for each row execute function log_estado_cliente();

drop trigger if exists clientes_log_estado_upd on clientes;
create trigger clientes_log_estado_upd after update on clientes
  for each row execute function log_estado_cliente();

-- ---------------------------------------------------------------------
-- 6. VERIFICACOES_CATALOGO — as verificações do site, configuráveis
--    (acrescentar uma verificação nova NÃO exige migração)
-- ---------------------------------------------------------------------
create table if not exists verificacoes_catalogo (
  codigo     text primary key,
  titulo     text not null,
  descricao  text,
  peso       numeric(4,2) not null default 1,
  ativo      boolean not null default true,
  ordem      int not null default 0
);

insert into verificacoes_catalogo (codigo, titulo, descricao, ordem) values
  ('https',        'Ligação segura (HTTPS)',       'O site serve em HTTPS com certificado válido.', 1),
  ('velocidade',   'Velocidade de resposta',        'Tempo de resposta do servidor ao primeiro pedido.', 2),
  ('titulo',       'Título da página',              'Tem <title> descritivo e com dimensão adequada.', 3),
  ('meta_desc',    'Meta description',              'Tem descrição para os resultados de pesquisa.', 4),
  ('viewport',     'Preparado para telemóvel',      'Declara viewport para ecrãs pequenos.', 5),
  ('h1',           'Título principal (H1)',         'A página tem um H1 que diz ao que vem.', 6),
  ('open_graph',   'Partilha nas redes (Open Graph)','Tem og:title/og:image para partilhas bonitas.', 7),
  ('alt_imagens',  'Texto alternativo nas imagens', 'As imagens têm alt (acessibilidade e SEO).', 8),
  ('contacto',     'Contacto direto visível',       'Telefone ou email clicáveis na página.', 9),
  ('formulario',   'Formulário de contacto',        'Existe forma de deixar contacto no site.', 10),
  ('redes_ligadas','Redes sociais ligadas',         'O site aponta para as redes da marca.', 11)
on conflict (codigo) do nothing;

-- ---------------------------------------------------------------------
-- 7. PACOTES — serviços, preços e âmbito editáveis (fora do código)
-- ---------------------------------------------------------------------
create table if not exists pacotes (
  id             uuid primary key default gen_random_uuid(),
  chave          text unique not null,
  nome           text not null,
  tagline        text,
  descricao      text,
  setup_min      numeric(10,2),
  setup_max      numeric(10,2),
  avenca_min     numeric(10,2),
  ambito_default jsonb not null default '[]'::jsonb,
  ativo          boolean not null default true,
  ordem          int not null default 0
);

insert into pacotes (chave, nome, tagline, setup_min, setup_max, avenca_min, ordem, ambito_default) values
  ('fundacao','Fundação','pôr a casa em ordem', 1500, 2500, null, 1,
   '["Diagnóstico completo da presença digital","Identidade base: como a marca fala e se mostra","Site ou página que explica e converte em 5 segundos","Perfis de redes sociais montados e otimizados","Ficha no Google para apareceres a quem procura na tua zona"]'::jsonb),
  ('motor','Motor','o marketing a acontecer todos os meses', 1500, 2500, 600, 2,
   -- NOTA: cada cliente tem um assistente com nome próprio. O «Quinto» é o
   -- assistente do próprio Nº 5 e NUNCA é oferecido a clientes.
   '["Plano de conteúdos mensal, pensado para o teu negócio","Publicações e reels com a cara da marca","Gestão das redes: publicar, responder, acompanhar","Assistente de IA com nome próprio, à medida da tua marca, a responder a quem chega","Relatório mensal — números antes de adjetivos"]'::jsonb),
  ('performance','Performance','motor + gasolina para escalar', 1500, 2500, null, 3,
   '["Tudo o que o Motor faz","Anúncios pagos (Meta/Google) com verba definida contigo","Otimização contínua: o que dá resultado, reforça-se","Medição a sério: custo por contacto, não vaidade","Reunião mensal de estratégia e próximos passos"]'::jsonb)
on conflict (chave) do nothing;

-- ---------------------------------------------------------------------
-- 8. DIAGNOSTICOS — o Raio-X evoluído, com histórico por cliente
-- ---------------------------------------------------------------------
create table if not exists diagnosticos (
  id              uuid primary key default gen_random_uuid(),
  cliente_id      uuid not null references clientes(id) on delete cascade,
  criado_por      uuid references profiles(id) on delete set null,
  versao          int not null default 1,
  estado          text not null default 'rascunho' check (estado in ('rascunho','concluido')),

  site_url        text,
  site_score      numeric(4,1),
  site_resultado  jsonb not null default '[]'::jsonb,
    -- [{codigo, estado: 'ok'|'warn'|'bad', detalhe, dica}]
  redes_scorecard jsonb not null default '[]'::jsonb,
    -- [{rede, nota: 0|1|2, obs}]

  -- Os três blocos do diagnóstico
  estado_atual    jsonb not null default '{}'::jsonb,
    -- {site, redes, presenca, ferramentas[], orcamento_atual, notas}
  objetivos       jsonb not null default '{}'::jsonb,
    -- {selecionados[], texto_livre}
  recomendacoes   jsonb not null default '[]'::jsonb,
    -- [{titulo, descricao, pacote_sugerido, prioridade, origem}]

  pacote_sugerido text,
  resumo_ia       text,
  partilha_token  uuid unique default gen_random_uuid(),
  partilha_ativa  boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (cliente_id, versao)
);
create index if not exists diagnosticos_cliente_idx on diagnosticos (cliente_id, created_at desc);

drop trigger if exists diagnosticos_updated on diagnosticos;
create trigger diagnosticos_updated before update on diagnosticos
  for each row execute function set_updated_at();

-- versão automática por cliente
create or replace function set_diagnostico_versao()
returns trigger language plpgsql as $$
begin
  if new.versao is null or new.versao = 1 then
    select coalesce(max(versao),0)+1 into new.versao from diagnosticos where cliente_id = new.cliente_id;
  end if;
  return new;
end $$;

drop trigger if exists diagnosticos_versao on diagnosticos;
create trigger diagnosticos_versao before insert on diagnosticos
  for each row execute function set_diagnostico_versao();

-- ---------------------------------------------------------------------
-- 9. PROPOSTAS
-- ---------------------------------------------------------------------
create table if not exists propostas (
  id             uuid primary key default gen_random_uuid(),
  cliente_id     uuid not null references clientes(id) on delete cascade,
  diagnostico_id uuid references diagnosticos(id) on delete set null,
  pacote_id      uuid references pacotes(id) on delete set null,
  criado_por     uuid references profiles(id) on delete set null,
  versao         int not null default 1,

  ambito         jsonb not null default '[]'::jsonb,   -- linhas editáveis
  setup_valor    numeric(10,2),
  setup_nota     text,
  avenca_valor   numeric(10,2),
  avenca_nota    text,

  conteudo       jsonb not null default '{}'::jsonb,
    -- {abertura, objetivo, prioridades[], porque_n5, fecho}

  estado         text not null default 'rascunho'
                   check (estado in ('rascunho','enviada','aceite','recusada')),
  enviada_em     timestamptz,
  decidida_em    timestamptz,
  motivo_recusa  text,

  partilha_token uuid unique default gen_random_uuid(),
  partilha_ativa boolean not null default false,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (cliente_id, versao)
);
create index if not exists propostas_cliente_idx on propostas (cliente_id, created_at desc);
create index if not exists propostas_estado_idx  on propostas (estado);

drop trigger if exists propostas_updated on propostas;
create trigger propostas_updated before update on propostas
  for each row execute function set_updated_at();

create or replace function set_proposta_versao()
returns trigger language plpgsql as $$
begin
  if new.versao is null or new.versao = 1 then
    select coalesce(max(versao),0)+1 into new.versao from propostas where cliente_id = new.cliente_id;
  end if;
  return new;
end $$;

drop trigger if exists propostas_versao on propostas;
create trigger propostas_versao before insert on propostas
  for each row execute function set_proposta_versao();

-- ---------------------------------------------------------------------
-- 10. AVENCAS — recorrentes em tabela própria (MRR correcto no tempo)
-- ---------------------------------------------------------------------
create table if not exists avencas (
  id           uuid primary key default gen_random_uuid(),
  cliente_id   uuid not null references clientes(id) on delete cascade,
  proposta_id  uuid references propostas(id) on delete set null,
  valor_mensal numeric(10,2) not null,
  dia_cobranca int check (dia_cobranca between 1 and 28),
  inicio       date not null default current_date,
  fim          date,
  estado       text not null default 'ativa' check (estado in ('ativa','suspensa','terminada')),
  notas        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists avencas_cliente_idx on avencas (cliente_id);
create index if not exists avencas_ativas_idx  on avencas (estado) where estado = 'ativa';

drop trigger if exists avencas_updated on avencas;
create trigger avencas_updated before update on avencas
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------
-- 11. AUTOMATISMO — a proposta empurra o cliente no funil
-- ---------------------------------------------------------------------
create or replace function sync_cliente_por_proposta()
returns trigger language plpgsql as $$
begin
  if new.estado is distinct from old.estado then
    if new.estado = 'enviada' then
      new.enviada_em := coalesce(new.enviada_em, now());
      update clientes set estado = 'proposta'
        where id = new.cliente_id and estado not in ('cliente','perdido');

    elsif new.estado = 'aceite' then
      new.decidida_em := coalesce(new.decidida_em, now());
      update clientes set estado = 'cliente' where id = new.cliente_id;
      -- cria a avença se a proposta tem valor mensal e ainda não existe
      if coalesce(new.avenca_valor,0) > 0
         and not exists (select 1 from avencas where proposta_id = new.id) then
        insert into avencas (cliente_id, proposta_id, valor_mensal, notas)
        values (new.cliente_id, new.id, new.avenca_valor, 'Criada a partir da proposta aceite.');
      end if;

    elsif new.estado = 'recusada' then
      new.decidida_em := coalesce(new.decidida_em, now());
      update clientes set estado = 'perdido',
                          motivo_perda = coalesce(new.motivo_recusa, motivo_perda)
        where id = new.cliente_id;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists propostas_sync_cliente on propostas;
create trigger propostas_sync_cliente before update on propostas
  for each row execute function sync_cliente_por_proposta();

-- ---------------------------------------------------------------------
-- 12. SEGURANÇA (RLS) — só utilizadores autenticados.
--     As páginas públicas de partilha são servidas no servidor com a
--     service_role e o partilha_token; não passam por estas políticas.
-- ---------------------------------------------------------------------
alter table profiles              enable row level security;
alter table clientes              enable row level security;
alter table contactos             enable row level security;
alter table atividades            enable row level security;
alter table estado_historico      enable row level security;
alter table diagnosticos          enable row level security;
alter table propostas             enable row level security;
alter table avencas               enable row level security;
alter table pacotes               enable row level security;
alter table verificacoes_catalogo enable row level security;

do $$
declare t text;
begin
  foreach t in array array['clientes','contactos','atividades','estado_historico',
                           'diagnosticos','propostas','avencas','pacotes','verificacoes_catalogo']
  loop
    execute format('drop policy if exists %I on %I', t||'_auth_all', t);
    execute format(
      'create policy %I on %I for all to authenticated using (true) with check (true)',
      t||'_auth_all', t);
  end loop;
end $$;

-- cada utilizador vê/edita o seu próprio perfil
drop policy if exists profiles_self_select on profiles;
create policy profiles_self_select on profiles for select to authenticated using (true);

drop policy if exists profiles_self_update on profiles;
create policy profiles_self_update on profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
