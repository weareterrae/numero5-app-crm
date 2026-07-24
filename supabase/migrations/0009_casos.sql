-- =====================================================================
-- Nº 5 · Casos reais para as propostas
--
-- Uma proposta não deve ser só números e texto. Mostra ao cliente o que
-- já fizemos — com prova real, nunca inventada. Estas marcas já estão
-- públicas em numerocinco.pt, por isso podem ser mostradas.
-- Correr no SQL Editor do Supabase. Seguro de correr novamente.
-- =====================================================================

create table if not exists casos (
  chave      text primary key,
  marca      text not null,
  setor      text,
  o_que      text not null,          -- o que fizemos
  resultado  text,                    -- facto real, já público (ou vazio)
  imagem_url text,
  link       text,
  ativo      boolean not null default true,
  ordem      int not null default 0
);

insert into casos (chave, marca, setor, o_que, resultado, imagem_url, link, ordem) values
  ('terrae', 'Terrae', 'imobiliário',
   'Marca, site com diagnósticos interativos e o concierge de IA Joaquim.',
   '+107% seguidores em 30 dias · 3,10 € por contacto',
   'https://numerocinco.pt/assets/terrae.jpg', 'https://terrae.pt', 1),
  ('quenteebom', 'Quente e Bom', 'padaria e pastelaria',
   'Gestão de redes sociais, site e o assistente de IA Chef Joaquim.',
   '9 300+ seguidores',
   'https://numerocinco.pt/assets/quenteebom.jpg', 'https://quenteebom.com', 2),
  ('massaprima', 'Massa Prima', 'matérias-primas de panificação',
   'Site com 88 fichas técnicas e o assistente de IA Chef Prima.',
   'Catálogo completo online',
   'https://numerocinco.pt/assets/massaprima.jpg', 'https://massaprima.com', 3),
  ('aguaminda', 'Água Minda', 'bebidas / água de nascente',
   'Marca lançada de raiz, redes sociais e o assistente de IA Kianda.',
   null,
   'https://numerocinco.pt/assets/aguaminda.jpg', 'https://aguaminda.com', 4),
  ('koolnature', 'KoolNature', 'sustentabilidade / jardinagem',
   'Site e presença digital para o biocarvão da Ekoology.',
   null,
   'https://numerocinco.pt/assets/koolnature.jpg', 'https://koolnature.pt', 5),
  ('externato', 'Externato Santa Maria de Belém', 'educação',
   'Site novo e a assistente de IA Avó Maria para a escola no Restelo.',
   null,
   'https://numerocinco.pt/assets/externato.jpg', 'https://externatosantamariadebelem.com', 6)
on conflict (chave) do nothing;

alter table casos enable row level security;
drop policy if exists casos_auth_all on casos;
create policy casos_auth_all on casos for all to authenticated using (true) with check (true);

-- Que casos aparecem em cada proposta (lista de chaves).
alter table propostas
  add column if not exists casos jsonb not null default '[]'::jsonb;
