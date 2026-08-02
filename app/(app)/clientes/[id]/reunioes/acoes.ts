"use server";

import { revalidatePath } from "next/cache";
import { criarClienteServidor } from "@/lib/supabase/server";

const t = (v: FormDataEntryValue | null) => {
  const s = (v ?? "").toString().trim();
  return s === "" ? null : s;
};
const n = (v: FormDataEntryValue | null) => {
  const s = (v ?? "").toString().trim().replace(",", ".");
  if (s === "") return null;
  const x = Number(s);
  return Number.isFinite(x) ? Math.round(x) : null;
};

export async function guardarReuniao(formData: FormData) {
  const clienteId = t(formData.get("cliente_id"));
  if (!clienteId) return;

  const supabase = await criarClienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const dataReuniao = t(formData.get("data")) ?? new Date().toISOString().slice(0, 10);
  const formato = t(formData.get("formato")) ?? "online";
  const ehExtra = formData.get("incluida") === "extra";
  const faturar = formData.get("faturar") === "on";
  const objetivo = t(formData.get("objetivo"));

  await supabase.from("reunioes").insert({
    cliente_id: clienteId,
    data: dataReuniao,
    duracao_planeada_min: n(formData.get("duracao_planeada_min")),
    duracao_real_min: n(formData.get("duracao_real_min")),
    participantes: t(formData.get("participantes")),
    objetivo,
    decisoes: t(formData.get("decisoes")),
    tarefas: t(formData.get("tarefas")),
    formato,
    incluida: !ehExtra,
    faturar,
    notas: t(formData.get("notas")),
    autor_id: user?.id ?? null,
  });

  // Reunião extra a faturar → cria já o item cobrável na produção. Sem isto,
  // o valor ficava assinalado aqui e esquecido na faturação (fuga de receita).
  if (ehExtra && faturar) {
    const { data: precoCat } = await supabase
      .from("precos_unitarios")
      .select("preco")
      .eq("chave", "reunioes_extra")
      .maybeSingle();
    const base = Number(precoCat?.preco) || 60;
    const suplemento = formato === "presencial" ? 50 : 0;
    await supabase.from("producao_itens").insert({
      cliente_id: clienteId,
      mes: `${dataReuniao.slice(0, 7)}-01`,
      tipo: "reuniao",
      descricao: `Reunião extra${formato === "presencial" ? " (presencial)" : ""}${objetivo ? ` — ${objetivo}` : ""} · ${dataReuniao}`,
      quantidade: 1,
      extra: true,
      valor: base + suplemento,
      faturado: false,
      data: dataReuniao,
      autor_id: user?.id ?? null,
    });
  }

  revalidatePath(`/clientes/${clienteId}/reunioes`);
  revalidatePath(`/clientes/${clienteId}`);
}

export async function alternarFaturada(id: string, clienteId: string, _fd: FormData) {
  const supabase = await criarClienteServidor();
  const { data: r } = await supabase.from("reunioes").select("faturada").eq("id", id).maybeSingle();
  await supabase
    .from("reunioes")
    .update({ faturada: !r?.faturada })
    .eq("id", id);
  revalidatePath(`/clientes/${clienteId}/reunioes`);
}

export async function apagarReuniao(id: string, clienteId: string, _fd: FormData) {
  const supabase = await criarClienteServidor();
  await supabase.from("reunioes").delete().eq("id", id);
  revalidatePath(`/clientes/${clienteId}/reunioes`);
  revalidatePath(`/clientes/${clienteId}`);
}
