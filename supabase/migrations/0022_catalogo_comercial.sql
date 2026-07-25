-- =====================================================================
-- Nº 5 · Sistema comercial — Fase 1: fundação de dados
--
-- Estende o catálogo para um sistema comercial a sério (âmbito, margem,
-- PT/EN, custo interno), cria a auditoria de alterações e as configurações
-- globais, e carrega os serviços ainda [A DEFINIR]. Tudo ADITIVO — não
-- remove nem altera o que já funciona.
-- Correr no SQL Editor do Supabase. Seguro de correr novamente.
-- =====================================================================

-- ── 1. Catálogo: campos novos ────────────────────────────────────────
alter table precos_unitarios
  add column if not exists rotulo_en          text,
  -- tipo de cobrança fino (mensal | setup | extra | custo_externo); a coluna
  -- `tipo` continua a ser o "balde" do cálculo (mensal vs. arranque).
  add column if not exists cobranca           text,
  add column if not exists descricao_interna  text,
  add column if not exists desc_cliente_pt    text,
  add column if not exists desc_cliente_en    text,
  add column if not exists inclusoes          text,
  add column if not exists exclusoes          text,
  add column if not exists limite_revisoes    int,
  add column if not exists limites            jsonb not null default '{}'::jsonb,
  add column if not exists tempo_planeado_min int,
  add column if not exists custo_interno      numeric,
  add column if not exists preco_minimo       numeric,
  add column if not exists percentagem        numeric,
  add column if not exists permite_desconto   boolean not null default true,
  add column if not exists mostrar_discriminado boolean not null default false,
  add column if not exists dependencias       text,
  add column if not exists notas_internas     text,
  -- estado: 'ativo' | 'inativo' | 'a_definir'. Mantém-se `ativo` (boolean) em
  -- paralelo para não partir o que já o usa; ficam sincronizados.
  add column if not exists estado             text not null default 'ativo';

-- Alinhar estado com o ativo atual, e marcar sem-preço como a_definir.
update precos_unitarios set estado = 'inativo'  where ativo = false and estado = 'ativo';
update precos_unitarios set estado = 'a_definir' where preco is null and estado <> 'inativo';

-- cobranca a partir do tipo existente (para já: mensal/setup).
update precos_unitarios set cobranca = tipo where cobranca is null;

-- ── 2. Configurações globais (chave/valor) ───────────────────────────
create table if not exists configuracoes (
  chave      text primary key,
  valor      text,
  descricao  text,
  updated_at timestamptz not null default now()
);
alter table configuracoes enable row level security;
drop policy if exists configuracoes_auth_all on configuracoes;
create policy configuracoes_auth_all on configuracoes for all to authenticated using (true) with check (true);

insert into configuracoes (chave, valor, descricao) values
  ('valor_hora_alvo', '65', 'Valor-alvo por hora efetiva (€), interno. [PROVISÓRIO]'),
  ('passo_arredondamento', '50', 'Arredondar o total comercial ao múltiplo superior de (€).'),
  ('limiar_amarelo_hora', '45', 'Abaixo deste €/hora o cliente fica amarelo.'),
  ('limiar_vermelho_hora', '30', 'Abaixo deste €/hora o cliente fica vermelho.')
on conflict (chave) do nothing;

-- ── 3. Auditoria de alterações comerciais ────────────────────────────
create table if not exists auditoria (
  id             uuid primary key default gen_random_uuid(),
  tabela         text not null,
  registo_id     text,
  campo          text,
  valor_anterior text,
  valor_novo     text,
  motivo         text,
  autor_id       uuid references profiles(id) on delete set null,
  created_at     timestamptz not null default now()
);
create index if not exists auditoria_tabela_idx on auditoria (tabela, created_at desc);
alter table auditoria enable row level security;
drop policy if exists auditoria_auth_all on auditoria;
create policy auditoria_auth_all on auditoria for all to authenticated using (true) with check (true);

-- ── 4. Nomes EN + mínimos/percentagem nos serviços que já existem ─────
update precos_unitarios set rotulo_en = coalesce(rotulo_en, x.en), preco_minimo = coalesce(preco_minimo, x.minimo), percentagem = coalesce(percentagem, x.pct)
from (values
  ('post','Single-image post', null::numeric, null::numeric),
  ('carrossel','Carousel', null, null),
  ('reel','Reel / short video', null, null),
  ('story','Story', null, null),
  ('gestao_canal','First channel management', null, null),
  ('gestao_canal_extra','Additional channel management', null, null),
  ('anuncios','Ad management', 150, null),
  ('anuncios_pct','Ads — % of budget', null, 10),
  ('moderacao','Replies & moderation with approval', null, null),
  ('assistente','Site virtual assistant', null, null),
  ('relatorio','Monthly report', null, null),
  ('identidade','Identity & strategy', null, null),
  ('montar_perfis','Profile setup', null, null),
  ('perfis','Profile setup', null, null),
  ('site_novo','New website (per page)', null, null),
  ('site_melhorias','Website improvements', null, null),
  ('loja_online','Online store', null, null),
  ('assistente_setup','Build the site assistant', null, null),
  ('moderacao_setup','Install the replies system', null, null)
) as x(chave, en, minimo, pct)
where precos_unitarios.chave = x.chave;

-- ── 5. Serviços ainda [A DEFINIR] (preço null, não entram no orçamento) ─
insert into precos_unitarios (chave, rotulo, rotulo_en, tipo, cobranca, categoria, estado, ativo, preco)
select v.chave, v.rotulo, v.en, v.tipo, v.cobranca, v.categoria, 'a_definir', false, null
from (values
  ('foto_presencial','Fotografia presencial','On-site photography','setup','extra','Produção'),
  ('video_presencial','Vídeo presencial (captação)','On-site video shoot','setup','extra','Produção'),
  ('deslocacoes','Deslocações','Travel','setup','extra','Produção'),
  ('edicao_video_longo','Edição de vídeo longo','Long-form video editing','setup','extra','Produção'),
  ('landing_page','Landing page','Landing page','setup','setup','Arranque'),
  ('manutencao_site','Manutenção mensal do site','Monthly website maintenance','mensal','mensal','Gestão'),
  ('alojamento','Alojamento','Hosting','mensal','custo_externo','Custos externos'),
  ('dominio','Domínio','Domain','setup','custo_externo','Custos externos'),
  ('carregamento_produtos','Carregamento de produtos','Product upload','setup','setup','Arranque'),
  ('traducao','Tradução PT/EN','PT/EN translation','setup','extra','Produção'),
  ('email_marketing','Email marketing','Email marketing','mensal','mensal','Gestão'),
  ('criar_newsletter','Criação de newsletter','Newsletter design','setup','setup','Arranque'),
  ('envio_newsletter','Envio de newsletter','Newsletter sending','mensal','mensal','Gestão'),
  ('chatbot_whatsapp','Chatbot para WhatsApp','WhatsApp chatbot','setup','setup','Arranque'),
  ('integracao_crm','Integração com CRM','CRM integration','setup','setup','Arranque'),
  ('automacoes','Automações','Automations','setup','setup','Arranque'),
  ('config_campanhas','Configuração inicial de campanhas','Campaign setup','setup','setup','Arranque'),
  ('config_tracking','Pixel, conversões e tracking','Pixel, conversions & tracking','setup','setup','Arranque'),
  ('criativos_anuncios','Criativos adicionais para anúncios','Extra ad creatives','setup','extra','Produção'),
  ('reunioes_extra','Reuniões extraordinárias','Extra meetings','setup','extra','Gestão'),
  ('revisoes_extra','Revisões adicionais','Extra revisions','setup','extra','Produção'),
  ('trabalho_urgente','Trabalho urgente','Rush work','setup','extra','Produção'),
  ('locucao','Locução profissional','Professional voice-over','setup','extra','Produção'),
  ('animacao_avancada','Animação avançada','Advanced animation','setup','extra','Produção'),
  ('licencas_apis','Licenças, APIs e ferramentas de terceiros','Third-party licenses, APIs & tools','setup','custo_externo','Custos externos')
) as v(chave, rotulo, en, tipo, cobranca, categoria)
where not exists (select 1 from precos_unitarios p where p.chave = v.chave);
