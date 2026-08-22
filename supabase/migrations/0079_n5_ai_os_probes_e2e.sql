-- =====================================================================
-- N5 AI OS · probes ponta a ponta dos assistentes            [0079]
-- ---------------------------------------------------------------------
-- Nasce de uma descoberta a 22/08/2026: o painel de estado dava VERDE
-- para "Terrae · Joaquim" e "Academia · Tutor", mas o que testava era o
-- `estado-motor` — ou seja, "o motor de IA tem chave e responde".
--
-- Se o chat.js partisse (prompt, parsing, rate-limit, captação de lead),
-- o painel continuava verde e ninguém sabia. Os dois assistentes que
-- mais preocupam o Sandro eram os únicos NÃO testados a sério. E os
-- diagnósticos — o mais valioso da Terrae — não eram testados de todo.
--
-- Isto cria vigias que fazem uma pergunta REAL ao endpoint REAL e
-- verificam a resposta, incluindo o que separa credível de plausível:
-- os números vieram de pesquisa ou de memória?
-- =====================================================================

create table if not exists ai_vigias (
  id             uuid primary key default gen_random_uuid(),
  chave          text unique not null,          -- 'terrae-joaquim'
  nome           text not null,
  marca          text,
  url            text not null,
  metodo         text not null default 'POST',
  -- Corpo do pedido: uma pergunta real, não um ping.
  corpo          jsonb not null default '{}'::jsonb,
  cabecalhos     jsonb not null default '{}'::jsonb,

  -- O QUE CONTA COMO RESPOSTA BOA
  -- Caminho no JSON onde vive a resposta (ex.: 'reply').
  campo_resposta text,
  -- Comprimento mínimo: uma resposta de 3 caracteres não é resposta.
  min_caracteres integer not null default 40,
  -- Texto que TEM de aparecer (ex.: 'exclusiv' para o Joaquim).
  deve_conter    text[] not null default '{}',
  -- Texto que NÃO pode aparecer (ex.: 'manutenção', 'não consigo').
  nao_pode_conter text[] not null default
    array['em manutenção','estou em manutenção','not available','indisponível'],
  -- Campos obrigatórios num diagnóstico (ex.: ['score','eur_m2_zona']).
  campos_json    text[] not null default '{}',
  -- Espera-se que este pedido tenha PESQUISADO? (diagnósticos: sim)
  espera_pesquisa boolean not null default false,

  timeout_ms     integer not null default 45000,
  intervalo_min  integer not null default 30,
  ativo          boolean not null default true,
  critico        boolean not null default true,  -- falha => incidente crítico
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
drop trigger if exists ai_vigias_updated on ai_vigias;
create trigger ai_vigias_updated before update on ai_vigias
  for each row execute function set_updated_at();

create table if not exists ai_vigia_execucoes (
  id           uuid primary key default gen_random_uuid(),
  vigia_id     uuid not null references ai_vigias(id) on delete cascade,
  ok           boolean not null,
  http_status  integer,
  latencia_ms  integer,
  -- Porque falhou, em linguagem de quem opera: 'timeout', 'http_500',
  -- 'resposta_curta', 'falta_campo:score', 'texto_proibido:manutenção',
  -- 'sem_pesquisa'.
  motivo       text,
  amostra      text,                      -- primeiros caracteres, p/ diagnóstico
  created_at   timestamptz not null default now()
);
create index if not exists ai_vigia_exec_recente on ai_vigia_execucoes (vigia_id, created_at desc);

alter table ai_vigias           enable row level security;
alter table ai_vigia_execucoes  enable row level security;
do $$
declare t text;
begin
  foreach t in array array['ai_vigias','ai_vigia_execucoes'] loop
    execute format('drop policy if exists %I on %I', t || '_staff', t);
    execute format('create policy %I on %I for all to authenticated '
      'using (n5_is_staff()) with check (n5_is_staff())', t || '_staff', t);
  end loop;
end $$;

-- Estado atual de cada vigia, para o painel.
create or replace view ai_vigias_estado
with (security_invoker = true) as
select
  v.id, v.chave, v.nome, v.marca, v.ativo, v.critico, v.espera_pesquisa,
  (select e.ok          from ai_vigia_execucoes e where e.vigia_id = v.id order by e.created_at desc limit 1) as ultimo_ok,
  (select e.motivo      from ai_vigia_execucoes e where e.vigia_id = v.id order by e.created_at desc limit 1) as ultimo_motivo,
  (select e.latencia_ms from ai_vigia_execucoes e where e.vigia_id = v.id order by e.created_at desc limit 1) as ultima_latencia,
  (select e.created_at  from ai_vigia_execucoes e where e.vigia_id = v.id order by e.created_at desc limit 1) as ultima_verificacao,
  (select count(*) from ai_vigia_execucoes e
     where e.vigia_id = v.id and not e.ok and e.created_at > now() - interval '24 hours') as falhas_24h,
  (select count(*) from ai_vigia_execucoes e
     where e.vigia_id = v.id and e.created_at > now() - interval '24 hours') as total_24h
from ai_vigias v;

comment on view ai_vigias_estado is
  'Painel AI Operations: prova de que cada assistente RESPONDEU, não só de que o motor tem chave.';

-- ---------------------------------------------------------------------
-- Vigias iniciais. Pergunta real, verificação real.
-- ---------------------------------------------------------------------
insert into ai_vigias (chave, nome, marca, url, corpo, campo_resposta, deve_conter, min_caracteres, timeout_ms)
values
  ('terrae-joaquim', 'Joaquim', 'Terrae',
   'https://terrae.pt/.netlify/functions/chat',
   '{"messages":[{"role":"user","content":"Quero vender um apartamento em Oeiras. Como funciona?"}]}'::jsonb,
   'reply', array['exclusiv'], 120, 45000),

  ('linhasgerais-mestre', 'Mestre', 'Linhas Gerais',
   'https://linhasgerais.netlify.app/api/mestre',
   '{"messages":[{"role":"user","content":"Fazem reabilitacao de predios inteiros?"}]}'::jsonb,
   'reply', array['reabilita'], 80, 45000),

  ('quenteebom-joaquim', 'Chef Joaquim', 'Quente e Bom',
   'https://quenteebom.com/api/joaquim',
   '{"messages":[{"role":"user","content":"Que pao tem hoje?"}]}'::jsonb,
   null, '{}', 60, 30000),

  ('massaprima-chef', 'Chef Prima', 'Massa Prima',
   'https://massaprima.com/api/chef-prima',
   '{"messages":[{"role":"user","content":"Que farinha usam no pao alentejano?"}]}'::jsonb,
   'reply', '{}', 60, 30000),

  ('aguaminda-kianda', 'Kianda', 'Água Minda',
   'https://aguaminda.com/api/kianda',
   '{"messages":[{"role":"user","content":"Onde posso comprar a vossa agua?"}]}'::jsonb,
   'reply', '{}', 60, 30000)
on conflict (chave) do nothing;

-- Origem correta por vigia (a allowlist dos sites exige-a).
update ai_vigias set cabecalhos = jsonb_build_object('origin', 'https://terrae.pt',      'referer', 'https://terrae.pt/')       where chave = 'terrae-joaquim';
update ai_vigias set cabecalhos = jsonb_build_object('origin', 'https://linhasgerais.netlify.app')                              where chave = 'linhasgerais-mestre';
update ai_vigias set cabecalhos = jsonb_build_object('origin', 'https://quenteebom.com')                                        where chave = 'quenteebom-joaquim';
update ai_vigias set cabecalhos = jsonb_build_object('origin', 'https://massaprima.com')                                        where chave = 'massaprima-chef';
update ai_vigias set cabecalhos = jsonb_build_object('origin', 'https://aguaminda.com')                                         where chave = 'aguaminda-kianda';

insert into schema_migrations (version) values ('0079')
on conflict (version) do nothing;
