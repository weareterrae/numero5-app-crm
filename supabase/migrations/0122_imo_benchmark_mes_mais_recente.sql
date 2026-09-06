-- =====================================================================
-- 0122 · imo_benchmark: dentro da mesma linha, ganha o mês mais recente
-- ---------------------------------------------------------------------
-- A colheita do MicroSIR é mensal e cada mês grava uma linha nova por
-- zona e tipologia (janela móvel de 24 meses). A escolha do benchmark
-- ordenava por «mais transações» antes de «mais recente» (0113), regra
-- pensada para preferir a fonte com mais amostra, não para escolher entre
-- meses da mesma linha. Como a janela desliza, a amostra varia uns por
-- cento de mês para mês, e em Setembro de 2026 139 das 267 linhas com
-- dois meses continuavam a servir Agosto (Carnaxide T3: 4 394 de Agosto
-- em vez de 4 521 de Setembro, com 481 contra 477 transações).
--
-- A correcção é cirúrgica: só a versão mais recente de cada linha
-- (fonte, geografia, tipo, tipologia) entra na escolha. Tudo o resto fica
-- igual: tipologia específica > tipo específico > mais transações > mais
-- recente, e a preferência entre fontes (SIR em PDF vs MicroSIR) não muda.
-- O histórico (imo-dados, imo-api /serie) continua a ler todos os meses.
-- =====================================================================

drop function if exists imo_benchmark(uuid, text, text, integer);

create function imo_benchmark(
  p_geografia uuid, p_tipo text, p_tipologia text,
  p_min_transacoes integer default 8
) returns table (
  benchmark_id uuid, fonte_id text, geografia_id uuid, nivel text,
  nome text, eur_m2 numeric, medida text, n_transacoes integer,
  periodo text, desconto numeric, p25 numeric, p75 numeric, dispersao numeric,
  natureza text, area_base text,
  absorcao_dias integer, yield_bruta numeric, desconto_negociacao numeric,
  eur_m2_novos numeric, eur_m2_usados numeric,
  tipologia_benchmark text,
  tipo_benchmark text
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
             b.eur_m2_p25, b.eur_m2_p75, b.dispersao,
             coalesce(b.extra ->> 'natureza', f.tipo),
             b.extra ->> 'area_base',
             b.tempo_absorcao_dias,
             nullif(b.extra ->> 'yield_bruta', '')::numeric,
             nullif(b.extra ->> 'desconto_acumulado', '')::numeric,
             nullif(b.extra ->> 'eur_m2_novos', '')::numeric,
             nullif(b.extra ->> 'eur_m2_usados', '')::numeric,
             coalesce(b.tipologia, ''),
             coalesce(b.tipo_imovel, '')
        from imo_benchmarks b
        join imo_geografias g on g.id = b.geografia_id
        join imo_fontes f on f.id = b.fonte_id
       where b.geografia_id = v_geo
         and f.escalao = 1
         and coalesce(b.eur_m2_mediano, b.eur_m2_medio) is not null
         and (b.tipo_imovel = '' or imo_chave(b.tipo_imovel) = imo_chave(p_tipo))
         and (b.tipologia = '' or imo_chave(b.tipologia) = imo_chave(p_tipologia))
         and coalesce(b.n_transacoes, 0) >= p_min_transacoes
         -- SÓ A VERSÃO MAIS RECENTE DE CADA LINHA. Um mês anterior da mesma
         -- fonte, geografia, tipo e tipologia, com amostra suficiente, tira
         -- este da corrida.
         and not exists (
           select 1
             from imo_benchmarks n
            where n.fonte_id = b.fonte_id
              and n.geografia_id = b.geografia_id
              and n.tipo_imovel = b.tipo_imovel
              and n.tipologia = b.tipologia
              and coalesce(n.eur_m2_mediano, n.eur_m2_medio) is not null
              and coalesce(n.n_transacoes, 0) >= p_min_transacoes
              and n.periodo_fim > b.periodo_fim
         )
       order by (b.tipologia <> '')::int desc,
                (b.tipo_imovel <> '')::int desc,
                b.n_transacoes desc nulls last,
                b.periodo_fim desc nulls last
       limit 1;
    if found then return; end if;

    select pai_id into v_geo from imo_geografias where id = v_geo;
  end loop;
end $$;

-- Só o service_role (0120): revogar também de authenticated, que recebe
-- EXECUTE pelos default privileges.
revoke all on function imo_benchmark(uuid, text, text, integer) from public, anon, authenticated;
grant execute on function imo_benchmark(uuid, text, text, integer) to service_role;

comment on function imo_benchmark(uuid, text, text, integer) is
  'Escolhe o benchmark mais granular COM amostra suficiente, subindo na '
  'hierarquia até encontrar. Dentro da mesma linha (fonte, geografia, tipo, '
  'tipologia) só o mês mais recente entra na escolha (0122). Diz a NATUREZA '
  'e a base de ÁREA (0104), o ESTADO DO MERCADO (0111), o €/m² de NOVO e de '
  'USADO (0112) e QUE LINHA escolheu (0113).';

insert into schema_migrations (version) values ('0122')
on conflict (version) do nothing;
