-- Nº 5 · Guia da Marca
-- Briefing profundo por marca, preenchido pelo cliente na Sede com ajuda da IA.
-- Coluna própria (o brief_sede da ficha é reescrito e colidiria).
alter table clientes add column if not exists guia_marca jsonb;
