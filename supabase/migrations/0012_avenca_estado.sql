-- =====================================================================
-- Nº 5 · A avença segue o estado do cliente
--
-- Se um cliente deixa de ser "cliente" (voltou a lead, deu-se como
-- perdido, etc.), a avença ativa TERMINA — senão a receita recorrente
-- (MRR) fica a contar dinheiro que já não entra.
-- Correr no SQL Editor do Supabase. Seguro de correr novamente.
-- =====================================================================

create or replace function encerrar_avencas_ao_sair()
returns trigger language plpgsql as $$
begin
  if old.estado = 'cliente' and new.estado is distinct from 'cliente' then
    update avencas
       set estado = 'terminada',
           fim = coalesce(fim, current_date),
           updated_at = now()
     where cliente_id = new.id and estado = 'ativa';
  end if;
  return new;
end $$;

drop trigger if exists clientes_encerrar_avencas on clientes;
create trigger clientes_encerrar_avencas after update on clientes
  for each row execute function encerrar_avencas_ao_sair();

-- Corrigir o estado atual: avenças ativas de quem já não é cliente.
update avencas a
   set estado = 'terminada',
       fim = coalesce(a.fim, current_date),
       updated_at = now()
  from clientes c
 where a.cliente_id = c.id
   and a.estado = 'ativa'
   and c.estado <> 'cliente';
