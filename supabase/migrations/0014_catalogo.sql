-- =====================================================================
-- Nº 5 · Catálogo de serviços vivo
-- A tabela de preços passa a ser um catálogo que cresce: vídeo,
-- fotografia, desenvolvimento de apps, o que aparecer. Cada serviço
-- pode ter uma categoria (para agrupar) e ser adicionado/desativado.
-- Correr no SQL Editor do Supabase. Seguro de correr novamente.
-- =====================================================================

alter table precos_unitarios
  add column if not exists categoria text;

-- Etiquetar os serviços que já existem.
update precos_unitarios set categoria = 'Produção'  where chave in ('post','carrossel','reel','story');
update precos_unitarios set categoria = 'Gestão'    where chave in ('gestao_canal','gestao_canal_extra');
update precos_unitarios set categoria = 'Extras'    where chave in ('anuncios','anuncios_pct','moderacao','assistente','relatorio');
update precos_unitarios set categoria = 'Arranque'  where tipo = 'setup';
