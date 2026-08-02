-- 0052 — Briefing vivo mantido pelo cliente na Sede.
-- Free-text (público-alvo, ofertas, épocas-chave, «o que nunca dizer»), separado
-- do brief estruturado do diagnóstico (diagnosticos.brief) para não haver conflito.
-- A produção e os assistentes podem ler daqui o que o cliente mantém atualizado.

alter table clientes add column if not exists brief_sede jsonb not null default '{}'::jsonb;

comment on column clientes.brief_sede is 'Briefing vivo mantido pelo cliente na Sede (publico_alvo, ofertas, epocas, nunca_dizer).';
