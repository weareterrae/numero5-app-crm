-- =====================================================================
-- 0114 — os códigos postais de Portugal, para o formulário se preencher
-- ---------------------------------------------------------------------
-- PORQUE ISTO EXISTE
--
-- Hoje alguém escreve um código postal de Oeiras e escolhe «Lisboa» na
-- lista de concelhos. A camada de dados responde com toda a confiança —
-- à geografia errada. É o mesmo erro silencioso que se andou a caçar o
-- dia todo: dois números que não são da mesma coisa, comparados sem que
-- ninguém receba um aviso.
--
-- Com esta tabela o formulário deixa de perguntar o que pode deduzir. A
-- pessoa escreve 2790-008 e o concelho e a zona preenchem-se sozinhos.
--
-- A FONTE
--
-- Ficheiro oficial dos CTT, dados abertos. 197.010 códigos postais, com
-- rua, localidade e designação postal. Sem chave e sem limites.
--
-- O QUE ELE NÃO TRAZ, E PORQUE IMPORTA
--
-- Não traz FREGUESIA. Fora de Lisboa isso não faz falta: a designação
-- postal é o nome da localidade e a camada resolve-a — «Carnaxide»
-- encontra a União das Freguesias de Carnaxide e Queijas, «Quinta do
-- Anjo» encontra Quinta do Anjo.
--
-- Dentro de Lisboa a designação é só «LISBOA». Aí a camada cai ao
-- concelho: 6.144 €/m² em vez dos 7.121 de Avenidas Novas. São 16% de
-- precisão perdidos, e Lisboa não é um caso de canto.
--
-- Por isso a coluna `freguesia` fica aqui, vazia, e é preenchida à parte
-- por quem a saiba — um código postal de cada vez, guardado para sempre.
-- Nula significa «ainda não sabemos», e quem consome usa a designação
-- postal, que é o que se faz hoje.
-- =====================================================================

create table if not exists imo_codigos_postais (
  cp7            text primary key,
  -- «Carnaxide» — a designação postal, já escrita como se escreve. Os
  -- CTT gravam-na em maiúsculas; guardá-la assim seria mandar
  -- «CRUZ QUEBRADA-DAFUNDO» à camada de mercado, que foi verificada
  -- com «Cruz Quebrada-Dafundo».
  designacao     text not null,
  -- «Carnaxide» — a localidade, que é o que se mostra a uma pessoa
  localidade     text,
  concelho       text not null,
  distrito       text not null,
  -- As artérias daquele código postal. Um CP7 costuma ter uma ou duas;
  -- os das grandes avenidas têm mais.
  ruas           text[] not null default '{}',
  -- Preenchida à parte. Nula = ainda não sabemos, e nesse caso quem
  -- consome usa a designação. Nunca se inventa uma freguesia.
  freguesia      text,
  freguesia_em   timestamptz,
  atualizado_em  timestamptz not null default now()
);

comment on table imo_codigos_postais is
  'Códigos postais de Portugal a partir do ficheiro aberto dos CTT. '
  'Serve o preenchimento automático dos formulários: o CP é uma chave '
  'exacta, a morada escrita à mão não é. A freguesia NÃO vem dos CTT e '
  'é preenchida à parte; nula quer dizer «não sabemos», e nesse caso '
  'usa-se a designação postal, que resolve em todo o país excepto '
  'dentro de Lisboa.';

create index if not exists imo_cp_concelho_idx on imo_codigos_postais (concelho);
-- Para o sentido inverso — escrever a rua e sugerir os códigos postais.
-- É o sentido fraco (uma rua abrange dezenas de CP), mas serve de
-- recurso a quem não saiba o código postal de cor.
create index if not exists imo_cp_ruas_idx on imo_codigos_postais using gin (ruas);

alter table imo_codigos_postais enable row level security;
-- Sem políticas: só o service_role lá chega, como no resto da camada.
-- Um site não recebe chave de base de dados.

/* ---------------------------------------------------------------------
   A consulta. Aceita «2790-008», «2790008» ou « 2790-008 » — é a mesma
   coisa, e obrigar uma pessoa a acertar no hífen é desperdiçar uma
   conversão por um traço.

   Sem ponto e vírgula dentro do corpo: o editor do dashboard parte os
   comandos no `;` e cortaria a função a meio, deixando o `$$` por
   fechar. Uma função SQL de uma só instrução dispensa-o.
   --------------------------------------------------------------------- */
create or replace function imo_cp_consulta(p_cp7 text)
returns table (
  r_cp7 text, r_designacao text, r_localidade text,
  r_concelho text, r_distrito text, r_ruas text[],
  r_freguesia text,
  -- O que quem consome deve mandar como `zona` à camada de dados: a
  -- freguesia quando a temos, a designação quando não. Vai já decidido
  -- aqui para não haver duas regras diferentes em dois sítios.
  r_zona text
)
language sql stable security definer set search_path = public as $$
  with alvo as (
    select case
      when length(regexp_replace(coalesce(p_cp7, ''), '[^0-9]', '', 'g')) = 7
      then substring(regexp_replace(p_cp7, '[^0-9]', '', 'g') from 1 for 4) || '-' ||
           substring(regexp_replace(p_cp7, '[^0-9]', '', 'g') from 5 for 3)
      else null end as cp
  )
  select c.cp7, c.designacao, c.localidade, c.concelho, c.distrito, c.ruas,
         c.freguesia,
         coalesce(c.freguesia, c.designacao)
    from imo_codigos_postais c, alvo
   where c.cp7 = alvo.cp
$$;

revoke all on function imo_cp_consulta(text) from public, anon;
grant execute on function imo_cp_consulta(text) to service_role;
