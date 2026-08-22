-- =====================================================================
-- 0082 — Perguntas de referência: medir se a resposta é BOA
-- ---------------------------------------------------------------------
-- Os vigias provam que o assistente responde, está no tema e não devolve
-- texto enlatado. Não provam que a resposta é boa. É a maior lacuna que
-- este sistema tem: um assistente pode degradar-se durante semanas —
-- respostas mais vagas, factos errados, a persona a esbater-se — com todos
-- os semáforos verdes.
--
-- Já se tentou o caminho fácil e não funcionou: verificar palavras-chave
-- na resposta. Deu alarme falso logo à primeira, quando o Joaquim disse
-- «um único consultor do início à escritura» em vez da palavra
-- «exclusivo». Resposta perfeita, alarme a tocar. E um alarme que grita
-- sem razão deixa de ser lido — é nesse dia que o alarme a sério passa
-- despercebido. Foi retirado.
--
-- O que se faz em vez disso: um conjunto pequeno de perguntas com
-- CRITÉRIOS escritos em português, e um segundo modelo a julgar a resposta
-- contra esses critérios. Não é perfeito — um modelo a julgar outro tem os
-- seus vieses — mas é honesto sobre o que mede, e deteta a deriva lenta
-- que nenhuma verificação mecânica apanha.
--
-- Regras de desenho, aprendidas à custa:
--   · o juiz NUNCA é o mesmo modelo que respondeu (senão dá-se nota a si
--     próprio, e os modelos são complacentes consigo);
--   · o juiz vê os critérios, não uma resposta-modelo — respostas certas
--     escrevem-se de muitas maneiras;
--   · guarda-se a justificação, não só a nota. Uma nota sem porquê não
--     ensina nada a ninguém;
--   · corre uma vez por dia, não a cada meia hora: isto custa dinheiro e
--     mede tendência, não disponibilidade.
-- =====================================================================

create table if not exists ai_perguntas_referencia (
  id             uuid primary key default gen_random_uuid(),
  assistant_key  text not null,
  nome           text not null,
  pergunta       text not null,
  -- Critérios em português claro, um por linha. É isto que o juiz lê.
  criterios      text not null,
  -- Contexto que o site normalmente enviaria (system dinâmico), se aplicável.
  system         text,
  peso           smallint not null default 1 check (peso between 1 and 5),
  ativo          boolean not null default true,
  criado_em      timestamptz not null default now(),
  unique (assistant_key, nome)
);
comment on table ai_perguntas_referencia is
  'Perguntas de referência com critérios de avaliação. Poucas e boas: '
  'é para medir tendência de qualidade, não cobertura exaustiva.';

create table if not exists ai_avaliacoes (
  id             uuid primary key default gen_random_uuid(),
  pergunta_id    uuid not null references ai_perguntas_referencia(id) on delete cascade,
  correu_em      timestamptz not null default now(),
  -- quem respondeu e quem julgou
  modelo_resposta text,
  modelo_juiz     text,
  nota            smallint check (nota between 0 and 5),
  justificacao    text,
  falhas          text[],           -- critérios que não passaram
  resposta        text,             -- guardada para se poder ver o que mudou
  latencia_ms     integer,
  custo_usd       numeric(12,6),
  erro            text
);
create index if not exists ai_avaliacoes_recente
  on ai_avaliacoes (pergunta_id, correu_em desc);
comment on table ai_avaliacoes is
  'Resultado de cada avaliação. Guarda a RESPOSTA e a JUSTIFICAÇÃO: uma '
  'nota sem porquê não permite perceber o que se degradou.';

alter table ai_perguntas_referencia enable row level security;
alter table ai_avaliacoes enable row level security;
drop policy if exists ai_perguntas_referencia_staff on ai_perguntas_referencia;
create policy ai_perguntas_referencia_staff on ai_perguntas_referencia
  for select using (n5_is_staff());
drop policy if exists ai_avaliacoes_staff on ai_avaliacoes;
create policy ai_avaliacoes_staff on ai_avaliacoes
  for select using (n5_is_staff());

-- ---------------------------------------------------------------------
-- Vista: a tendência por assistente.
--
-- Uma nota isolada diz pouco — os modelos variam de dia para dia. O que
-- interessa é a média recente contra a anterior: é aí que se vê a deriva.
-- ---------------------------------------------------------------------
create or replace view ai_qualidade_tendencia
with (security_invoker = true) as
select
  p.assistant_key,
  count(*) filter (where a.correu_em > now() - interval '7 days')  as avaliacoes_7d,
  round(avg(a.nota) filter (where a.correu_em > now() - interval '7 days'), 2)  as nota_7d,
  round(avg(a.nota) filter (where a.correu_em between now() - interval '30 days'
                                                  and now() - interval '7 days'), 2) as nota_anterior,
  min(a.nota) filter (where a.correu_em > now() - interval '7 days') as pior_7d,
  max(a.correu_em) as ultima
from ai_perguntas_referencia p
join ai_avaliacoes a on a.pergunta_id = p.id
where p.ativo
group by p.assistant_key;

comment on view ai_qualidade_tendencia is
  'Nota média dos últimos 7 dias contra os 23 anteriores. A diferença é o '
  'sinal que interessa: uma nota isolada diz pouco, uma descida sustentada '
  'diz tudo.';
