-- =====================================================================
-- Nº 5 · Âmbito estruturado + preços unitários
-- Para orçamentar pelo trabalho real, não por estimativa.
-- Correr no SQL Editor do Supabase. Seguro de correr novamente.
-- =====================================================================

-- 1) O âmbito estruturado da proposta (canais, volumes, site, extras)
alter table propostas
  add column if not exists escopo jsonb not null default '{}'::jsonb;

-- 2) Tabela de preços unitários — a tua tabela de preços, num só sítio.
--    Os valores ficam VAZIOS de propósito: são decisão do Sandro.
--    Preenchem-se em Definições → Preços.
create table if not exists precos_unitarios (
  chave      text primary key,
  rotulo     text not null,
  descricao  text,
  tipo       text not null check (tipo in ('mensal','setup')),
  unidade    text not null,              -- 'unidade' | 'canal' | 'fixo' | 'pagina'
  preco      numeric(10,2),              -- NULL = por definir
  minutos    int,                        -- esforço estimado, opcional
  ativo      boolean not null default true,
  ordem      int not null default 0
);

insert into precos_unitarios (chave, rotulo, descricao, tipo, unidade, ordem) values
  -- Produção de conteúdo (por peça, por mês)
  ('post',        'Post (imagem única)',   'Peça estática: conceito, arte e copy.',            'mensal', 'unidade', 1),
  ('carrossel',   'Carrossel',             'Várias páginas: mais conceito e mais produção.',   'mensal', 'unidade', 2),
  ('reel',        'Reel / vídeo curto',    'Guião, edição, legendas e som.',                   'mensal', 'unidade', 3),
  ('story',       'História',              'Peça de story, estática ou animada.',              'mensal', 'unidade', 4),
  -- Gestão (por canal, por mês)
  ('gestao_canal','Gestão do canal',       'Publicar, responder, acompanhar — por cada rede.', 'mensal', 'canal',   5),
  -- Extras mensais
  ('anuncios',    'Gestão de anúncios',    'Campanhas, otimização e leitura de resultados.',   'mensal', 'fixo',    6),
  ('assistente',  'Assistente de IA',      'Manutenção do assistente da marca do cliente.',    'mensal', 'fixo',    7),
  ('relatorio',   'Relatório mensal',      'Números e leitura em linguagem de dono.',          'mensal', 'fixo',    8),
  -- Arranque (uma vez)
  ('site_novo',       'Site novo (por página)', 'Construção de raiz, por página.',             'setup',  'pagina',  9),
  ('site_melhorias',  'Melhorias ao site',      'Correções e afinações ao que já existe.',     'setup',  'fixo',   10),
  ('loja_online',     'Loja online',            'Catálogo e pagamentos.',                      'setup',  'fixo',   11),
  ('identidade',      'Identidade e estratégia','Como a marca fala e se mostra, documentado.', 'setup',  'fixo',   12),
  ('perfis',          'Montar perfis',          'Criar e otimizar os perfis das redes.',       'setup',  'canal',  13),
  ('assistente_setup','Criar o assistente',     'Assistente com nome próprio, à medida.',      'setup',  'fixo',   14)
on conflict (chave) do nothing;

alter table precos_unitarios enable row level security;
drop policy if exists precos_auth_all on precos_unitarios;
create policy precos_auth_all on precos_unitarios
  for all to authenticated using (true) with check (true);
