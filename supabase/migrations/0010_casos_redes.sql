-- =====================================================================
-- Nº 5 · Casos com link para as redes + investimento em valor único
--
-- (1) Cada caso passa a ter link para o site E para as redes sociais,
--     para o cliente ver o trabalho todo.
-- (2) A comparação "o que pediste vs a nossa recomendação" passa a ser
--     OPCIONAL. Por defeito, a proposta mostra só o nosso valor único
--     (setup + avença) — é a nossa oferta, ponto. A comparação liga-se
--     quando o comercial quiser.
-- Correr no SQL Editor do Supabase. Seguro de correr novamente.
-- =====================================================================

alter table casos add column if not exists link_redes text;

-- Handles reais do Instagram de cada marca (já públicos).
update casos set link_redes = 'https://instagram.com/weare.terrae'                where chave = 'terrae';
update casos set link_redes = 'https://instagram.com/quenteebom'                  where chave = 'quenteebom';
update casos set link_redes = 'https://instagram.com/massaprima'                  where chave = 'massaprima';
update casos set link_redes = 'https://instagram.com/aguaminda'                   where chave = 'aguaminda';
update casos set link_redes = 'https://instagram.com/ekoologycharcoal'            where chave = 'koolnature';
update casos set link_redes = 'https://instagram.com/externatosantamariadebelem'  where chave = 'externato';

-- Mostrar (ou não) a comparação com o pedido do cliente. Por defeito: não.
alter table propostas
  add column if not exists mostrar_comparacao boolean not null default false;
