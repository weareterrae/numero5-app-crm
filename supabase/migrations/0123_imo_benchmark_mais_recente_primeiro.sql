-- =====================================================================
-- 0123 · imo_benchmark: o mais recente ganha, seja de que fonte for
-- ---------------------------------------------------------------------
-- Decisão do Sandro a 7 de Setembro de 2026: «quero que seja sempre o
-- valor mais recente, por isso temos o MCP ligado ao Apify». A colheita
-- mensal do MicroSIR existe para o site e a API dizerem o mercado de
-- hoje, não o do último PDF.
--
-- Até aqui a ordem era: tipologia específica > tipo específico > mais
-- transações > mais recente. Isso fazia o PDF do SIR de Junho (9 720
-- transações na União de Carnaxide e Queijas) ganhar ao MicroSIR de
-- Setembro (1 260) na linha de todas as tipologias, e ia continuar a
-- ganhar em Dezembro, com o PDF a envelhecer. A 0122 já tinha posto o mês
-- mais recente a ganhar DENTRO da mesma linha; esta põe-o a ganhar entre
-- fontes também.
--
-- A ordem passa a ser:
--
--   1. tipologia específica antes de «todas»
--   2. tipo específico antes de «todos»
--   3. PERÍODO MAIS RECENTE
--   4. mais transações (desempate)
--
-- O que NÃO muda: só fontes de transação (escalão 1); o mínimo de
-- amostra (p_min_transacoes, 8 por omissão); a subida na hierarquia
-- quando a zona não tem linha; e a resposta diz sempre a fonte, o
-- período e a amostra, para quem lê saber de onde veio. Uma linha
-- derivada pela Terrae (extra.derivado, concelhos sem MicroSIR) continua
-- a poder ser escolhida e vai marcada na API.
--
-- Efeito medido antes de aplicar (freguesias e concelhos, 7 pedidos
-- cada): as linhas gerais e as de concelho passam do SIR em PDF (Junho)
-- para o MicroSIR (Setembro); as linhas de tipologia já eram MicroSIR.
-- Ganho colateral: o benchmark da tipologia e o geral passam a vir da
-- mesma fonte e do mesmo período, e o ajuste de tipologia da área local
-- (imo-dados) volta a poder calcular-se.
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
       order by (b.tipologia <> '')::int desc,
                (b.tipo_imovel <> '')::int desc,
                b.periodo_fim desc nulls last,
                b.n_transacoes desc nulls last
       limit 1;
    if found then return; end if;

    select pai_id into v_geo from imo_geografias where id = v_geo;
  end loop;
end $$;

-- Só o service_role (0120).
revoke all on function imo_benchmark(uuid, text, text, integer) from public, anon, authenticated;
grant execute on function imo_benchmark(uuid, text, text, integer) to service_role;

comment on function imo_benchmark(uuid, text, text, integer) is
  'Escolhe o benchmark mais granular COM amostra suficiente, subindo na '
  'hierarquia até encontrar: tipologia específica, depois tipo específico, '
  'depois o PERÍODO MAIS RECENTE seja de que fonte for (0123), depois mais '
  'transações. Diz a NATUREZA e a base de ÁREA (0104), o ESTADO DO MERCADO '
  '(0111), o €/m² de NOVO e de USADO (0112) e QUE LINHA escolheu (0113).';

insert into schema_migrations (version) values ('0123')
on conflict (version) do nothing;
