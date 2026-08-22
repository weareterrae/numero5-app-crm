-- =====================================================================
-- 0089 — O benchmark aceita média, não só mediana
-- ---------------------------------------------------------------------
-- A função exigia `eur_m2_mediano is not null` e devolvia sempre nada
-- para os dados do SIR. A razão é simples e eu não a tinha previsto: o
-- SIR publica MÉDIA e QUARTIS (P25/P75); a mediana explícita não existe
-- no relatório. O INE é que publica mediana.
--
-- Duas fontes, duas convenções, e a função só conhecia uma.
--
-- Prefere-se a mediana quando existe — é mais robusta a valores extremos,
-- e num mercado com poucas transações isso conta. Mas uma média com 9866
-- observações e quartis conhecidos é um bom estimador central: a
-- alternativa era descartar a melhor fonte que temos por causa de uma
-- convenção estatística.
--
-- Devolve-se também DE ONDE veio o número, para o relatório poder dizê-lo
-- em vez de o apresentar como se fosse tudo a mesma coisa.
-- =====================================================================

drop function if exists imo_benchmark(uuid, text, text, integer);

create or replace function imo_benchmark(
  p_geografia uuid, p_tipo text, p_tipologia text,
  p_min_transacoes integer default 8
) returns table (
  benchmark_id uuid, fonte_id text, geografia_id uuid, nivel text,
  nome text, eur_m2 numeric, medida text, n_transacoes integer,
  periodo text, desconto numeric, p25 numeric, p75 numeric, dispersao numeric
)
language plpgsql stable security definer set search_path = public as $$
declare v_geo uuid := p_geografia;
begin
  while v_geo is not null loop
    return query
      select b.id, b.fonte_id, b.geografia_id, g.nivel, g.nome,
             coalesce(b.eur_m2_mediano, b.eur_m2_medio),
             case when b.eur_m2_mediano is not null then 'mediana' else 'media' end,
             b.n_transacoes, b.periodo, b.desconto_medio,
             b.eur_m2_p25, b.eur_m2_p75, b.dispersao
        from imo_benchmarks b
        join imo_geografias g on g.id = b.geografia_id
        join imo_fontes f on f.id = b.fonte_id
       where b.geografia_id = v_geo
         and f.escalao = 1
         and coalesce(b.eur_m2_mediano, b.eur_m2_medio) is not null
         -- Vazio = «todos»: um benchmark sem tipologia serve qualquer uma.
         and (b.tipo_imovel = '' or imo_chave(b.tipo_imovel) = imo_chave(p_tipo))
         and (b.tipologia = '' or imo_chave(b.tipologia) = imo_chave(p_tipologia))
         and coalesce(b.n_transacoes, 0) >= p_min_transacoes
       -- O mais específico primeiro: um benchmark do T3 daquela zona vale
       -- mais do que a média de todas as tipologias. Depois, mais amostra
       -- e mais recente.
       order by (b.tipologia <> '')::int desc,
                (b.tipo_imovel <> '')::int desc,
                b.n_transacoes desc nulls last,
                b.periodo_fim desc nulls last
       limit 1;
    if found then return; end if;

    select pai_id into v_geo from imo_geografias where id = v_geo;
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- A zona com o nome do concelho é o CONCELHO, não uma freguesia dele
-- ---------------------------------------------------------------------
-- Pedir a zona «Cascais» devolvia a freguesia «UF Cascais e Estoril»,
-- porque o nome dela contém «Cascais» e a procura casa por semelhança.
-- Um imóvel em Alcabideche — também concelho de Cascais — ficava
-- atribuído à zona errada, e a avaliação usava o benchmark de outro
-- mercado sem ninguém perceber.
--
-- Quando alguém escreve o nome do concelho como zona, está a dizer que
-- não sabe a freguesia. A resposta honesta é o concelho: menos preciso,
-- mas verdadeiro. Adivinhar uma freguesia é mais preciso e pode estar
-- errado — e num valor de imóvel, errado custa mais do que vago.
create or replace function imo_geo_por_nome(p_zona text, p_concelho text)
returns uuid
language plpgsql stable security definer set search_path = public as $$
declare
  v_conc uuid; v_id uuid;
begin
  if coalesce(p_concelho,'') <> '' then
    select id into v_conc from imo_geografias
     where nivel = 'concelho' and nome_chave = imo_chave(p_concelho) limit 1;
  end if;

  -- A zona é o próprio concelho: não se desce mais.
  if v_conc is not null and imo_chave(coalesce(p_zona,'')) = imo_chave(p_concelho) then
    return v_conc;
  end if;

  if coalesce(p_zona,'') <> '' then
    -- microzona dentro do concelho
    if v_conc is not null then
      select g.id into v_id
        from imo_geografias g
        join imo_geografias f on f.id = g.pai_id
       where g.nivel = 'microzona' and g.nome_chave = imo_chave(p_zona)
         and f.pai_id = v_conc
       limit 1;
      if v_id is not null then return v_id; end if;
    end if;

    -- microzona em qualquer sítio (sem concelho não há como desambiguar)
    select id into v_id from imo_geografias
     where nivel = 'microzona' and nome_chave = imo_chave(p_zona) limit 1;
    if v_id is not null then return v_id; end if;

    -- freguesia cujo nome CONTÉM a zona (as uniões trazem vários nomes).
    -- Exata primeiro: «Barcarena» não deve casar antes de si própria.
    select id into v_id from imo_geografias
     where nivel = 'freguesia'
       and (v_conc is null or pai_id = v_conc)
       and nome_chave = imo_chave(p_zona)
     limit 1;
    if v_id is not null then return v_id; end if;

    select id into v_id from imo_geografias
     where nivel = 'freguesia'
       and (v_conc is null or pai_id = v_conc)
       and nome_chave like '%' || imo_chave(p_zona) || '%'
     limit 1;
    if v_id is not null then return v_id; end if;
  end if;

  return v_conc;
end $$;

grant execute on function imo_geo_por_nome(text, text) to service_role;

revoke all on function imo_benchmark(uuid, text, text, integer) from public, anon;
grant execute on function imo_benchmark(uuid, text, text, integer) to service_role;

comment on function imo_benchmark(uuid, text, text, integer) is
  'Escolhe o benchmark mais granular COM amostra suficiente, subindo na '
  'hierarquia até encontrar. Aceita mediana (INE) ou média (SIR) e diz '
  'qual usou — as duas fontes publicam medidas diferentes.';
