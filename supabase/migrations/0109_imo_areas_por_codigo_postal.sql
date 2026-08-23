-- =====================================================================
-- 0109 · Áreas de mercado por código postal
-- ---------------------------------------------------------------------
-- A área adaptativa pergunta pelo mercado à volta da CASA — 300 m, e
-- alarga só até haver transações que cheguem. O problema é de onde vem a
-- resposta: o site não pode consultar o MicroSIR em direto, porque as
-- credenciais vivem no Apify e é lá que devem ficar.
--
-- Esta tabela é a ponte. Guarda o resultado da escada por CÓDIGO POSTAL,
-- e o formulário de avaliação já pede o código postal — obrigatório.
--
-- ---------------------------------------------------------------------
-- PORQUE A CHAVE É O CP7 E NÃO A COORDENADA
-- ---------------------------------------------------------------------
-- Não é uma aproximação nossa: é a unidade da PRÓPRIA FONTE. O Micro-SIR
-- georreferencia as transações «a partir dos centroides dos códigos-
-- postais a 7 dígitos». Duas casas no mesmo CP7 partilham o centroide de
-- qualquer maneira — usá-lo como chave não perde precisão nenhuma, e
-- ganha uma cache que acerta sempre em vez de quase nunca.
--
-- Uma cache por coordenada exata seria inútil: cada casa é um ponto
-- diferente e nunca haveria dois pedidos iguais.
--
-- ---------------------------------------------------------------------
-- O QUE FAZ ISTO BARATO: A FILA
-- ---------------------------------------------------------------------
-- Cada consulta ao MicroSIR custa um login (~30 s). Uma corrida por
-- avaliação seriam cinquenta logins num dia com cinquenta avaliações —
-- caro para nós e indelicado para eles.
--
-- Por isso a avaliação NÃO espera. Quando o CP7 não está em cache,
-- marca-se `pendente` e serve-se o benchmark da freguesia, que existe
-- sempre. Uma tarefa diária recolhe TODOS os pendentes numa só corrida,
-- com UM login. Vinte pontos passam a custar um login em vez de vinte.
--
-- A avaliação seguinte naquele código postal já encontra a área fina.
-- É o mesmo padrão da amostra de comparáveis, que hoje se viu funcionar:
-- 119 s na primeira avaliação de Carnaxide, 50 s na segunda.
--
-- ---------------------------------------------------------------------
-- O QUE NÃO SE ENCONTRA TAMBÉM SE GUARDA
-- ---------------------------------------------------------------------
-- Se nem a 2 km houver transações que cheguem, o resultado é «não há área
-- de mercado observável aqui» — e isso guarda-se como resultado, não como
-- ausência. Senão o mesmo ponto sem mercado voltaria à fila todos os
-- dias, para sempre, a gastar um lugar numa corrida.
-- =====================================================================

create table if not exists imo_cp_areas (
  -- Normalizado como NNNN-NNN. É a chave natural e é o que o formulário
  -- pede; um id sintético só acrescentaria uma junção.
  cp7            text primary key check (cp7 ~ '^[0-9]{4}-[0-9]{3}$'),

  -- Coordenadas do centroide. NÃO expiram: um código postal não se muda
  -- de sítio. Ficam mesmo quando a área de mercado falha ou caduca.
  lat            numeric(9,6),
  lng            numeric(9,6),
  coordenadas_em timestamptz,

  concelho       text,
  freguesia      text,
  -- A geografia onde este CP7 cai, para a avaliação poder cair para a
  -- freguesia enquanto a área fina não existe.
  geografia_id   uuid references imo_geografias(id) on delete set null,

  -- 'pendente' = na fila · 'ok' = tem área · 'sem_area' = nem a 2 km há
  -- amostra · 'erro' = a colheita falhou e vale a pena tentar outra vez.
  estado         text not null default 'pendente'
                 check (estado in ('pendente','ok','sem_area','erro')),

  -- ---- o resultado da escada
  raio_m         integer,          -- meia-largura do quadrado escolhido
  amostra        integer,          -- transações nesse quadrado
  meses          integer,
  eur_m2_medio   numeric(10,2),
  eur_m2_p25     numeric(10,2),
  eur_m2_p75     numeric(10,2),
  -- A escada TODA. «Porquê 750 m e não 500?» é uma pergunta que um
  -- avaliador tem de saber responder.
  escada         jsonb,

  colhido_em     timestamptz,
  -- O mercado move-se e o Micro-SIR atualiza ao mês. Mas a janela é de 24
  -- meses móveis: num mês muda 1/24 dos dados. Noventa dias deixam a
  -- cache útil sem a deixar mentir — e a colheita mensal da AML continua
  -- a atualizar o benchmark da freguesia, que é a rede por baixo.
  valida_ate     timestamptz,

  tentativas     integer not null default 0,
  ultimo_erro    text,
  created_at     timestamptz not null default now()
);

create index if not exists imo_cp_areas_fila
  on imo_cp_areas (estado, tentativas) where estado in ('pendente','erro');
create index if not exists imo_cp_areas_geo on imo_cp_areas (geografia_id);

comment on table imo_cp_areas is
  'Área de mercado adaptativa por código postal a 7 dígitos — a mesma '
  'unidade em que o Micro-SIR georreferencia as transações. Enche-se sob '
  'demanda: a avaliação marca o que falta, uma corrida diária colhe tudo '
  'de uma vez com um login só.';

comment on column imo_cp_areas.raio_m is
  'Meia-largura do QUADRADO, não raio de círculo. Um quadrado de 300 m de '
  'meia-largura contém o círculo de 300 m e mais 27% nos cantos.';

-- ---------------------------------------------------------------------
-- LER — e marcar o que falta, na mesma passagem
-- ---------------------------------------------------------------------
-- Devolve a área se estiver boa. Se não estiver, mete o código postal na
-- fila e devolve nulo — para quem chama servir a freguesia e seguir.
--
-- As duas coisas na mesma função de propósito: separá-las convidava a
-- que alguém lesse sem marcar, e um miss que ninguém regista é um miss
-- que se repete para sempre.
create or replace function imo_cp_area(
  p_cp7 text,
  p_lat numeric default null,
  p_lng numeric default null,
  p_geografia uuid default null
) returns table (
  cp7 text, estado text, raio_m integer, amostra integer,
  eur_m2_medio numeric, eur_m2_p25 numeric, eur_m2_p75 numeric,
  colhido_em timestamptz, escada jsonb
)
language plpgsql security definer set search_path = public as $$
declare
  v_cp text;
  v_linha imo_cp_areas%rowtype;
begin
  -- «2795229», « 2795-229 » e «2795-229» são o mesmo código postal.
  v_cp := regexp_replace(coalesce(p_cp7, ''), '[^0-9]', '', 'g');
  if length(v_cp) <> 7 then return; end if;
  v_cp := substring(v_cp from 1 for 4) || '-' || substring(v_cp from 5 for 3);

  select * into v_linha from imo_cp_areas where imo_cp_areas.cp7 = v_cp;

  if v_linha.cp7 is null then
    insert into imo_cp_areas (cp7, lat, lng, geografia_id, coordenadas_em, estado)
    values (v_cp, p_lat, p_lng, p_geografia,
            case when p_lat is not null then now() end, 'pendente')
    on conflict (cp7) do nothing;
    return;
  end if;

  -- Coordenadas que cheguem agora e não estivessem lá completam a linha
  -- sem esperar pela corrida.
  if v_linha.lat is null and p_lat is not null then
    update imo_cp_areas set lat = p_lat, lng = p_lng,
           geografia_id = coalesce(p_geografia, imo_cp_areas.geografia_id),
           coordenadas_em = now()
     where imo_cp_areas.cp7 = v_cp;
  end if;

  -- Caducada volta à fila. Não se devolve: um número de há seis meses
  -- apresentado como atual é pior do que não ter número.
  if v_linha.estado = 'ok' and v_linha.valida_ate is not null and v_linha.valida_ate < now() then
    update imo_cp_areas set estado = 'pendente' where imo_cp_areas.cp7 = v_cp;
    return;
  end if;

  if v_linha.estado <> 'ok' then return; end if;

  return query select v_linha.cp7, v_linha.estado, v_linha.raio_m, v_linha.amostra,
                      v_linha.eur_m2_medio, v_linha.eur_m2_p25, v_linha.eur_m2_p75,
                      v_linha.colhido_em, v_linha.escada;
end $$;

-- ---------------------------------------------------------------------
-- A FILA — o que a corrida diária vai buscar
-- ---------------------------------------------------------------------
-- Só sai quem tem coordenadas: sem elas não há escada que desenhar.
-- Ordena-se pelos que menos vezes se tentaram, para um ponto teimoso não
-- monopolizar as corridas todas.
create or replace function imo_cp_fila(p_limite integer default 40)
returns table (cp7 text, lat numeric, lng numeric)
language sql stable security definer set search_path = public as $$
  select a.cp7, a.lat, a.lng
    from imo_cp_areas a
   where a.estado in ('pendente','erro')
     and a.lat is not null and a.lng is not null
     -- Três tentativas falhadas chegam. À quarta o problema não é a
     -- corrida, e insistir só gasta logins.
     and a.tentativas < 3
   order by a.tentativas, a.created_at
   limit greatest(1, least(p_limite, 200));
$$;

-- ---------------------------------------------------------------------
-- GRAVAR o resultado de uma escada
-- ---------------------------------------------------------------------
create or replace function imo_cp_area_gravar(p_payload jsonb)
returns table (gravadas int, sem_area int, erros int)
language plpgsql security definer set search_path = public as $$
declare
  r jsonb;
  v_cp text;
  v_raio int; v_amostra int;
  v_ok int := 0; v_sem int := 0; v_err int := 0;
begin
  if jsonb_typeof(p_payload) <> 'array' then
    raise exception 'Esperava um array; recebi %.', jsonb_typeof(p_payload);
  end if;

  for r in select * from jsonb_array_elements(p_payload)
  loop
    v_cp := regexp_replace(coalesce(r ->> 'cp7', ''), '[^0-9]', '', 'g');
    if length(v_cp) <> 7 then continue; end if;
    v_cp := substring(v_cp from 1 for 4) || '-' || substring(v_cp from 5 for 3);

    v_raio := nullif(r #>> '{escolhido,raio_m}', '')::int;
    v_amostra := nullif(r #>> '{escolhido,amostra}', '')::int;

    if v_raio is null then
      -- Sem área utilizável. Guarda-se COMO RESULTADO: senão este ponto
      -- volta à fila todos os dias, para sempre.
      update imo_cp_areas set
        estado = 'sem_area', escada = r -> 'escada', colhido_em = now(),
        valida_ate = now() + interval '90 days',
        tentativas = tentativas + 1
       where cp7 = v_cp;
      v_sem := v_sem + 1;
      continue;
    end if;

    update imo_cp_areas set
      estado = 'ok',
      raio_m = v_raio,
      amostra = v_amostra,
      meses = nullif(r ->> 'months', '')::int,
      eur_m2_medio = nullif(r #>> '{price_m2,average}', '')::numeric,
      eur_m2_p25 = nullif(r #>> '{price_m2,p25}', '')::numeric,
      eur_m2_p75 = nullif(r #>> '{price_m2,p75}', '')::numeric,
      escada = r -> 'escada',
      colhido_em = now(),
      valida_ate = now() + interval '90 days',
      tentativas = tentativas + 1,
      ultimo_erro = null
     where cp7 = v_cp;
    v_ok := v_ok + 1;
  end loop;

  return query select v_ok, v_sem, v_err;
end $$;

revoke all on function imo_cp_area(text, numeric, numeric, uuid) from public, anon;
revoke all on function imo_cp_fila(integer) from public, anon;
revoke all on function imo_cp_area_gravar(jsonb) from public, anon;
grant execute on function imo_cp_area(text, numeric, numeric, uuid) to service_role;
grant execute on function imo_cp_fila(integer) to service_role;
grant execute on function imo_cp_area_gravar(jsonb) to service_role;

comment on function imo_cp_area(text, numeric, numeric, uuid) is
  'A área de mercado deste código postal, se estiver boa. Se não estiver, '
  'mete-o na fila e devolve nada — quem chama serve a freguesia e segue. '
  'Ler e marcar na mesma passagem, porque um miss que ninguém regista é '
  'um miss que se repete para sempre.';
