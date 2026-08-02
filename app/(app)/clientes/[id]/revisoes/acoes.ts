"use server";

import { revalidatePath } from "next/cache";
import { criarClienteServidor } from "@/lib/supabase/server";

const t = (v: FormDataEntryValue | null) => {
  const s = (v ?? "").toString().trim();
  return s === "" ? null : s;
};
const num = (v: FormDataEntryValue | null) => {
  const s = (v ?? "").toString().trim().replace(",", ".");
  if (s === "") return null;
  const x = Number(s);
  return Number.isFinite(x) ? x : null;
};

export async function guardarRevisao(formData: FormData) {
  const clienteId = t(formData.get("cliente_id"));
  const peca = t(formData.get("peca"));
  if (!clienteId || !peca) return;

  const supabase = await criarClienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const tipo = t(formData.get("tipo")) ?? "alteracao";
  // Correção é sempre incluída; retrabalho é sempre extra; alteração conforme escolha.
  const incluido = tipo === "retrabalho" ? false : formData.get("incluido") !== "extra";

  const dataRev = t(formData.get("data")) ?? new Date().toISOString().slice(0, 10);
  const valorInformado = num(formData.get("valor"));

  await supabase.from("revisoes").insert({
    cliente_id: clienteId,
    peca,
    versao: Math.max(1, Math.round(num(formData.get("versao")) ?? 1)),
    tipo,
    data: dataRev,
    pedido: t(formData.get("pedido")),
    origem: t(formData.get("origem")),
    horas: num(formData.get("horas")),
    incluido,
    valor: valorInformado,
    responsavel: t(formData.get("responsavel")),
    autor_id: user?.id ?? null,
  });

  // Revisão extra (retrabalho, ou alteração marcada como extra) → item cobrável
  // na produção, na hora. O valor vem do formulário ou do catálogo.
  if (!incluido) {
    let valor = valorInformado;
    if (!valor || valor <= 0) {
      const { data: precoCat } = await supabase
        .from("precos_unitarios")
        .select("preco")
        .eq("chave", "revisoes_extra")
        .maybeSingle();
      valor = Number(precoCat?.preco) || 35;
    }
    await supabase.from("producao_itens").insert({
      cliente_id: clienteId,
      mes: `${dataRev.slice(0, 7)}-01`,
      tipo: "outro",
      descricao: `Revisão extra (${tipo}) — ${peca} · ${dataRev}`,
      quantidade: 1,
      extra: true,
      valor,
      faturado: false,
      data: dataRev,
      autor_id: user?.id ?? null,
    });
  }

  revalidatePath(`/clientes/${clienteId}/revisoes`);
  revalidatePath("/");
}

export async function alternarFaturadaRev(id: string, clienteId: string, _fd: FormData) {
  const supabase = await criarClienteServidor();
  const { data: r } = await supabase.from("revisoes").select("faturada").eq("id", id).maybeSingle();
  await supabase
    .from("revisoes")
    .update({ faturada: !r?.faturada })
    .eq("id", id);
  revalidatePath(`/clientes/${clienteId}/revisoes`);
  revalidatePath("/");
}

export async function apagarRevisao(id: string, clienteId: string, _fd: FormData) {
  const supabase = await criarClienteServidor();
  await supabase.from("revisoes").delete().eq("id", id);
  revalidatePath(`/clientes/${clienteId}/revisoes`);
  revalidatePath("/");
}
