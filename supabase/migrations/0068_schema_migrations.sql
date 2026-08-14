-- 0068_schema_migrations.sql
-- Rastreio de migrações: acaba com o «isto já correu?».
--
-- Como não havia tracking, esta migração faz a RECONCILIAÇÃO de base: como a app
-- está em produção com todas as funcionalidades a funcionar, assumimos que 0001–0068
-- estão aplicadas e registamo-las. A partir daqui, CADA nova migração deve terminar com:
--     insert into schema_migrations(version) values ('00XX') on conflict do nothing;
-- e assim a tabela reflete sempre o estado real. Idempotente e seguro de correr.

create table if not exists schema_migrations (
  version    text primary key,
  applied_at timestamptz not null default now()
);

alter table schema_migrations enable row level security;
drop policy if exists schema_migrations_staff on schema_migrations;
create policy schema_migrations_staff on schema_migrations
  for all to authenticated using (n5_is_staff()) with check (n5_is_staff());

insert into schema_migrations (version)
select v from unnest(array[
  '0001','0002','0003','0004','0005','0006','0007','0008','0009','0010',
  '0011','0012','0013','0014','0015','0016','0017','0018','0019','0020',
  '0021','0022','0023','0024','0025','0026','0027','0028','0029','0030',
  '0031','0032','0033','0034','0035','0036','0037','0038','0039','0040',
  '0041','0042','0043','0044','0045','0046','0047','0048','0049','0050',
  '0051','0052','0053','0054','0055','0056','0057','0058','0059','0060',
  '0061','0062','0063','0064','0065','0066','0067','0068'
]) as v
on conflict (version) do nothing;
