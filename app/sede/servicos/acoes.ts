"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { criarClienteServico } from "@/lib/supabase/server";
import { contextoSede } from "@/lib/sede/contexto";
import { avisarStaffAcao } from "@/lib/sede/notificar";

const ROTULOS: Record<string, string> = {
  conteudo: "Mais conteúdo",
  anuncios: "Anúncios",
  site: "Site ou loja online",
  assistente: "Assistente no site",
  crm_portal: "CRM / portal",
  email: "Email marketing",
  foto: "Fotografia e vídeo",
  imagem: "Renovar a imagem",
};

/** O cliente pede uma proposta a partir da Sede — vira pedido de serviço (funil). */
export async function pedirServicoSede(fd: FormData) {
  const ctx = await contextoSede();
  if (!ctx.clienteId) redirect("/sede/servicos");

  const interesses = fd.getAll("interesse").map((v) => v.toString()).filter((k) => ROTULOS[k]);
  const nota = (fd.get("nota")?.toString() ?? "").trim().slice(0, 1000);
  if (interesses.length === 0 && !nota) redirect("/sede/servicos");

  const listaTxt = interesses.map((k) => ROTULOS[k]).join(", ");
  const texto = [
    listaTxt ? `Interesse em: ${listaTxt}.` : "",
    nota ? `Nota: ${nota}` : "",
  ]
    .filter(Boolean)
    .join(" ");

  const svc = criarClienteServico();
  await svc.from("pedidos").insert({
    cliente_id: ctx.clienteId,
    texto: texto || "Pedido de proposta",
    estado: "novo",
    tipo: "servico",
  });
  await svc.from("atividades").insert({
    cliente_id: ctx.clienteId,
    tipo: "nota",
    descricao: `💼 Na Sede, o cliente pediu proposta — ${texto || "sem detalhe"}`,
  });
  await avisarStaffAcao({
    clienteId: ctx.clienteId,
    titulo: "pediu uma proposta de serviço 💼",
    detalhe: texto || undefined,
  });

  revalidatePath("/sede/servicos");
  redirect("/sede/servicos?ok=1");
}
