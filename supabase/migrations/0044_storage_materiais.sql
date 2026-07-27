-- 0044_storage_materiais.sql
-- Upload de ficheiros (roadmap: diagnóstico + biblioteca).
-- Bucket privado «materiais» + acesso ao operador autenticado + coluna do caminho
-- do ficheiro na biblioteca. As páginas públicas nunca listam o bucket: o acesso
-- de leitura pública faz-se apenas por URL assinado gerado no servidor.

insert into storage.buckets (id, name, public)
values ('materiais', 'materiais', false)
on conflict (id) do nothing;

-- Operador (authenticated) pode gerir os ficheiros do bucket.
drop policy if exists materiais_auth_all on storage.objects;
create policy materiais_auth_all on storage.objects
  for all to authenticated
  using (bucket_id = 'materiais')
  with check (bucket_id = 'materiais');

-- Biblioteca: caminho do ficheiro anexo (opcional).
alter table biblioteca_conteudos
  add column if not exists ficheiro text;

comment on column biblioteca_conteudos.ficheiro is
  'Caminho no bucket «materiais» (ex.: {cliente_id}/{uuid}-nome.pdf). Acesso por URL assinado.';
