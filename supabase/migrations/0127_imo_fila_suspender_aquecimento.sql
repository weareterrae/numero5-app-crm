-- =====================================================================
-- 0127 · suspender o pré-aquecimento da fila do MicroSIR
-- ---------------------------------------------------------------------
-- A 7 de Setembro de 2026 a Confidencial Imobiliário contactou a Terrae
-- por causa de acessos à conta do MicroSIR. Nesse mesmo dia o
-- pré-aquecimento (scripts/imo-cp-aquecer.mjs) tinha feito a colheita
-- saltar de três a vinte e um códigos postais por dia para 120, e ainda
-- ficaram 180 na fila.
--
-- O âmbito nunca saiu da AML e o volume total continua pequeno (20
-- sessões em 17 dias), mas colher mais enquanto a conversa está aberta é
-- indefensável. A fila passa a servir SÓ o que veio de avaliações reais.
--
-- Isto NÃO desliga nada do que o cliente precisa: uma avaliação nova no
-- site continua a pôr o seu código postal na fila com origem
-- 'avaliacao', e a corrida das 09:00 e das 21:00 continua a colhê-lo. O
-- que fica parado são as centenas de pontos pedidos por antecipação.
--
-- PARA RETOMAR, quando a conversa estiver fechada: chamar
-- imo_cp_fila(p_limite, true), ou trocar o default de p_aquecimento para
-- true. Nada foi apagado: as 180 linhas continuam 'pendente' com
-- origem 'aquecimento' e voltam à fila no dia em que se decidir.
-- =====================================================================

drop function if exists imo_cp_fila(integer);

create function imo_cp_fila(
  p_limite integer default 40,
  p_aquecimento boolean default false
)
returns table (cp7 text, lat numeric, lng numeric)
language sql stable security definer set search_path = public as $$
  select a.cp7, a.lat, a.lng
    from imo_cp_areas a
   where a.estado in ('pendente', 'erro')
     and a.lat is not null and a.lng is not null
     and a.tentativas < 3
     -- Suspenso a 7 Set 2026: o aquecimento só volta à fila quando
     -- alguém o pedir explicitamente.
     and (coalesce(p_aquecimento, false) or a.origem <> 'aquecimento')
   order by (a.origem <> 'aquecimento') desc, a.tentativas, a.created_at
   limit greatest(1, least(coalesce(p_limite, 40), 200))
$$;

comment on function imo_cp_fila(integer, boolean) is
  'Códigos postais à espera de colheita. Por omissão NÃO devolve os do '
  'pré-aquecimento, suspenso a 7 Set 2026 durante a conversa com a '
  'Confidencial Imobiliário. Passar p_aquecimento => true para os incluir.';

revoke all on function imo_cp_fila(integer, boolean) from public, anon, authenticated;
grant execute on function imo_cp_fila(integer, boolean) to service_role;

insert into schema_migrations (version) values ('0127')
on conflict (version) do nothing;
