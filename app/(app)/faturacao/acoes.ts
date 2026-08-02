"use server";

import { revalidatePath } from "next/cache";
import { criarClienteServidor } from "@/lib/supabase/server";
import { criarFaturaRascunho } from "@/lib/faturacao/invoicexpress";
import { mesLegivel } from "@/lib/dominio/producao";

const t = (v: FormDataEntryValue | null) => {
  const s = (v ?? "").toString().trim();
  return s === "" ? null : s;
};
const n = (v: FormDataEntryValue | null) => {
  const s = (v ?? "").toString().trim().replace(",", ".");
  const x = Number(s);
  return Number.isFinite(x) ? x : 0;
};

/** Marca (ou desmarca) a avença de um cliente como cobrada num dado mês. */
export async function marcarCobranca(formData: FormData) {
  const clienteId = t(formData.get("cliente_id"));
  const mes = t(formData.get("mes"));
  const tipo = t(formData.get("tipo")) ?? "avenca";
  const cobrado = formData.get("cobrado") === "1";
  if (!clienteId || !mes) return;

  const supabase = await criarClienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  await supabase.from("cobrancas").upsert(
    {
      cliente_id: clienteId,
      mes,
      tipo,
      descricao: t(formData.get("descricao")),
      valor: n(formData.get("valor")),
      estado: cobrado ? "cobrado" : "por_cobrar",
      cobrado_em: cobrado ? new Date().toISOString() : null,
      criado_por: user?.id ?? null,
    },
    { onConflict: "cliente_id,mes,tipo" },
  );

  revalidatePath("/faturacao");
}

/**
 * Cria a fatura (RASCUNHO) da avença do mês no InvoiceXpress e guarda a
 * referência na cobrança. A finalização — número legal e comunicação à AT —
 * faz-se no InvoiceXpress, com revisão humana. Nunca emitimos às cegas.
 */
export async function emitirFaturaIX(formData: FormData) {
  const clienteId = t(formData.get("cliente_id"));
  const mes = t(formData.get("mes"));
  const tipo = t(formData.get("tipo")) ?? "avenca";
  const valor = n(formData.get("valor"));
  if (!clienteId || !mes || !(valor > 0)) return;

  const supabase = await criarClienteServidor();

  // Já tem fatura ligada? Não duplica.
  const { data: cob } = await supabase
    .from("cobrancas")
    .select("id, fatura_ix_id")
    .eq("cliente_id", clienteId)
    .eq("mes", mes)
    .eq("tipo", tipo)
    .maybeSingle();
  if (cob?.fatura_ix_id) return;

  // Dados fiscais do cliente (0018) + contacto principal.
  const { data: cli } = await supabase
    .from("clientes")
    .select("nome_marca, empresa_fiscal, nif, morada, codigo_postal, localidade")
    .eq("id", clienteId)
    .maybeSingle();
  if (!cli) return;
  const { data: contacto } = await supabase
    .from("contactos")
    .select("email")
    .eq("cliente_id", clienteId)
    .eq("principal", true)
    .limit(1)
    .maybeSingle();

  const r = await criarFaturaRascunho(
    {
      nome: cli.empresa_fiscal || cli.nome_marca,
      nif: cli.nif,
      email: contacto?.email ?? null,
      morada: cli.morada,
      codigo_postal: cli.codigo_postal,
      localidade: cli.localidade,
    },
    [
      {
        nome: `Acompanhamento de marketing — ${mesLegivel(mes)}`,
        descricao: `Avença mensal Nº 5 · ${mesLegivel(mes)}`,
        preco_unitario: valor,
      },
    ],
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (r.ok) {
    await supabase.from("cobrancas").upsert(
      {
        cliente_id: clienteId,
        mes,
        tipo,
        valor,
        fatura_ix_id: r.id,
        fatura_ix_url: r.url,
        fatura_ix_estado: r.estado,
        criado_por: user?.id ?? null,
      },
      { onConflict: "cliente_id,mes,tipo" },
    );
    await supabase.from("atividades").insert({
      cliente_id: clienteId,
      tipo: "nota",
      descricao: `🧾 Fatura em rascunho criada no InvoiceXpress (${mesLegivel(mes)}) — rever e finalizar lá.`,
    });
  } else {
    await supabase.from("atividades").insert({
      cliente_id: clienteId,
      tipo: "nota",
      descricao: `⚠️ Falhou criar a fatura no InvoiceXpress: ${r.erro}`,
    });
  }

  revalidatePath("/faturacao");
}
