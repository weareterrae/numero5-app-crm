-- =====================================================================
-- 0080 — O prompt pode viver num URL, e o gateway vai buscá-lo
-- ---------------------------------------------------------------------
-- Dois assistentes (Chef Prima e Chef Joaquim) têm o prompt num ficheiro
-- .txt no próprio site, que a equipa de marca edita sem tocar em código.
-- É um bom hábito e não se quer acabar com ele.
--
-- O problema é o caminho: o site vai buscar o ficheiro e envia-o INTEIRO
-- no corpo de cada pedido. No caso da Massa Prima são 72 KB — ~18 mil
-- tokens — em todas as mensagens. Foi isso que rebentou o teto de corpo do
-- gateway (64 KB) e obrigou a subi-lo para 256 KB.
--
-- Com o URL no registo, o gateway busca e guarda em memória. Ganha-se:
--   · o corpo do pedido passa a ser a conversa, não a enciclopédia;
--   · o prefixo fica sob o nosso controlo e o caching pega a sério;
--   · uma fonte da verdade declarada — hoje o URL está escrito no código
--     de cada site e ninguém sabe de fora qual é.
--
-- A equipa continua a editar o mesmo .txt. Nada muda para eles.
-- =====================================================================

alter table ai_assistants
  add column if not exists system_prompt_url text;

comment on column ai_assistants.system_prompt_url is
  'URL de onde o gateway vai buscar o system prompt quando `system_prompt` '
  'está vazio. Serve as marcas que editam o prompt num .txt do próprio '
  'site. O gateway guarda o resultado em memória por alguns minutos; se a '
  'busca falhar, o pedido segue sem prompt do registo e o site continua a '
  'poder enviar o seu (permite_system_dinamico).';

-- Só http(s), e nada de espaços: este valor vira um fetch do lado do
-- servidor. Sem esta cerca, uma linha mal escrita no registo tornava-se um
-- pedido a um sítio qualquer com as nossas credenciais de saída.
alter table ai_assistants
  drop constraint if exists ai_assistants_system_prompt_url_ck;
alter table ai_assistants
  add constraint ai_assistants_system_prompt_url_ck
  check (
    system_prompt_url is null
    or (system_prompt_url ~ '^https://[^\s]+$' and length(system_prompt_url) <= 500)
  );
