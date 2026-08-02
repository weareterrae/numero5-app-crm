-- 0056 — Coerência do produto «CRM / portal do cliente» (a Sede) + tipo de pedido
--
-- 1) O portal/CRM passa a ser um PRODUTO de catálogo (não estruturado), por isso
--    aparece automaticamente em «Outros serviços» no Configurador e pode entrar
--    numa proposta — sem tocar no motor de orçamento.
-- 2) `pedidos.tipo` separa pedidos operacionais (Balcão) de pedidos de serviço
--    (o cliente pede proposta a partir da Sede).
--
-- ⚠️ Preços PROVISÓRIOS (450 / 90) — o Sandro revê em Definições → Preços, e
--    define custo interno / tempo planeado para a rentabilidade ter base.

-- 1. Catálogo — o portal/CRM como produto
insert into precos_unitarios
  (chave, rotulo, rotulo_en, descricao, tipo, cobranca, unidade, preco, ativo, estado, categoria, ordem, permite_desconto)
values
  ('crm_portal',
   'Montar o CRM / portal do cliente (a Sede)',
   'Build the client CRM / portal',
   'Espaço próprio do cliente: leads organizadas, relatórios, planos, documentos e pedidos num sítio só — à medida da marca.',
   'setup', 'setup', 'fixo', 450, true, 'ativo', 'Arranque', 60, true),
  ('gestao_leads',
   'Gestão de leads e portal',
   'Leads & portal management',
   'Acompanhamento das leads no portal do cliente: organização, resposta a tempo e seguimento.',
   'mensal', 'mensal', 'fixo', 90, true, 'ativo', 'Gestão', 61, true)
on conflict (chave) do nothing;

-- 2. Tipo de pedido
alter table pedidos add column if not exists tipo text not null default 'operacional';
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'pedidos_tipo_check') then
    alter table pedidos add constraint pedidos_tipo_check check (tipo in ('operacional', 'servico'));
  end if;
end $$;
