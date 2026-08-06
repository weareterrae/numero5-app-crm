-- Marca de "última vez que o staff viu os Guias" — para o aviso (badge) de guias
-- concluídos por ver. Aditiva e tolerante: até correr, o aviso simplesmente não aparece.
alter table profiles add column if not exists guias_vistos_em timestamptz;
