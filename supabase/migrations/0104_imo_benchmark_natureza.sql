-- =====================================================================
-- 0104 · O benchmark passa a dizer o que é
-- ---------------------------------------------------------------------
-- PORQUE ISTO É PRECISO
--
-- O `ancoraSIR()` do motor faz `escritura = eur_m2 × (1 + price_gap)`.
-- Isso está certo para um preço PEDIDO — o gap é o que converte oferta em
-- escritura. Está errado para um preço que já é escritura: desconta-o
-- outra vez, e o imóvel perde 21-27% sem que nada dê erro.
--
-- E a função não tem como saber a diferença, porque o benchmark que
-- recebe não diz de que natureza é. Ela ADIVINHA, e a adivinha está
-- escrita no seu próprio comentário: «o €/m² do SIR é de OFERTA».
--
-- O glossário da plataforma diz o contrário, com todas as letras:
--
--   «Os dados apresentados no Micro-SIR reportam-se SEMPRE a preços de
--    venda atualizados para o presente (PVA).»
--
-- Uma suposição escrita num comentário é uma bomba com temporizador: um
-- dia a fonte muda e o comentário não. Passa a vir declarada nos dados.
--
-- ---------------------------------------------------------------------
-- O QUE ESTA MIGRAÇÃO FAZ, E O QUE NÃO FAZ
-- ---------------------------------------------------------------------
-- FAZ: acrescenta duas colunas ao que a função devolve — `natureza`
-- (transacao ou oferta, da tabela de fontes) e `area_base` (bruta
-- privativa ou útil, do registo). Nada mais muda: mesma seleção, mesma
-- ordem, mesmos resultados.
--
-- NÃO FAZ: mexer na ordem de desempate. Hoje ela é `n_transacoes desc`,
-- e isso levanta uma pergunta legítima — em Carnaxide, um benchmark de
-- junho com n=9720 ganha a um de agosto com n=1285. Qual descreve melhor
-- o mercado de hoje é uma questão de julgamento sobre dados que já
-- sustentam avaliações, e não se resolve de passagem numa migração que
-- veio corrigir outra coisa.
-- =====================================================================

drop function if exists imo_benchmark(uuid, text, text, integer);

create or replace function imo_benchmark(
  p_geografia uuid, p_tipo text, p_tipologia text,
  p_min_transacoes integer default 8
) returns table (
  benchmark_id uuid, fonte_id text, geografia_id uuid, nivel text,
  nome text, eur_m2 numeric, medida text, n_transacoes integer,
  periodo text, desconto numeric, p25 numeric, p75 numeric, dispersao numeric,
  -- 'transacao' = preço a que se escriturou · 'oferta' = preço pedido.
  -- Quem converte um no outro precisa de saber em qual está.
  natureza text,
  -- 'bruta privativa' ou 'util'. Dividir um preço por uma área útil com
  -- um €/m² de área bruta sobrevaloriza 10-20%, e o resultado continua a
  -- parecer normal.
  area_base text
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
             -- A natureza vem da FONTE, não de um campo solto: é lá que
             -- está declarada e é lá que se muda se um dia mudar.
             -- O registo pode contradizê-la (extra.natureza) e nesse caso
             -- ganha o registo, que é mais específico do que a fonte.
             coalesce(b.extra ->> 'natureza', f.tipo),
             b.extra ->> 'area_base'
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
       -- e mais recente. (Inalterado — ver a nota no cabeçalho.)
       order by (b.tipologia <> '')::int desc,
                (b.tipo_imovel <> '')::int desc,
                b.n_transacoes desc nulls last,
                b.periodo_fim desc nulls last
       limit 1;
    if found then return; end if;

    select pai_id into v_geo from imo_geografias where id = v_geo;
  end loop;
end $$;

revoke all on function imo_benchmark(uuid, text, text, integer) from public, anon;
grant execute on function imo_benchmark(uuid, text, text, integer) to service_role;

comment on function imo_benchmark(uuid, text, text, integer) is
  'Escolhe o benchmark mais granular COM amostra suficiente, subindo na '
  'hierarquia até encontrar. Aceita mediana (INE) ou média (SIR) e diz '
  'qual usou. Desde a 0104 diz também a NATUREZA (transacao ou oferta) e '
  'a base de ÁREA — sem isso quem consome tem de adivinhar, e adivinhar '
  'custou 21-27% no valor de cada imóvel ancorado no SIR.';

-- ---------------------------------------------------------------------
-- Os registos do SIR em PDF também passam a dizer a sua natureza
-- ---------------------------------------------------------------------
-- A fonte `sir` está declarada `tipo = 'transacao'`, e o `extra` destes
-- registos já diz `area: bruta_privativa`. Falta a natureza no formato
-- que a função lê, e falta ficar registado DE ONDE veio a afirmação —
-- porque esta é a linha de que todo o resto depende.
--
-- O script de importação diz que estes €/m² vêm da «página do Micro-SIR»
-- do relatório, e o glossário da plataforma diz que essa página são
-- preços de venda atualizados. Logo: transação.
--
-- O `desconto_medio` FICA. Deixa de ser um fator de conversão e passa a
-- ser o que sempre foi: o price gap da zona, um sinal de mercado que diz
-- quanto a oferta está acima do que se fecha. Vale para o relatório e
-- para a leitura de liquidez; não vale para multiplicar por um preço que
-- já é de venda.
update imo_benchmarks set
  extra = extra || jsonb_build_object(
    'natureza', 'transacao',
    'natureza_origem',
      'valores da página Micro-SIR do relatório; o glossário da plataforma '
      'declara-a como «preços de venda atualizados para o presente»',
    'area_base', coalesce(extra ->> 'area', 'bruta privativa')
  )
where fonte_id = 'sir'
  and extra ->> 'natureza' is null;
