"use server";

import { criarClienteServico } from "@/lib/supabase/server";
import { OBJETIVOS } from "@/lib/dominio/diagnostico/recomendacoes";
import { rotulo } from "@/lib/dominio/intake";

export type SubmissaoComecar = {
  marca: string;
  nome: string;
  email: string;
  telefone: string;
  setor: string;
  presenca: string;
  objetivos: string[];
  mensagem: string;
  /** Campo-armadilha: se vier preenchido, é um bot. */
  hp?: string;
};

/**
 * Cria um lead a partir do diagnóstico público do site. É PÚBLICO (sem sessão):
 * usa a service role para escrever, como as páginas /r/ e o /intake.
 * Devolve o token do intake, para o visitante poder continuar para o
 * diagnóstico profundo se quiser.
 */
export async function criarLeadPublico(dados: SubmissaoComecar) {
  // Armadilha para bots: fingimos sucesso, não criamos nada.
  if (dados.hp && dados.hp.trim() !== "") return { ok: true as const, token: null };

  const marca = dados.marca?.trim();
  const email = dados.email?.trim();
  if (!marca || marca.length < 2) return { ok: false as const, erro: "Diz-nos o nome da tua marca." };
  if (!email || !email.includes("@") || email.length < 5)
    return { ok: false as const, erro: "Precisamos de um email válido para te responder." };

  const supabase = criarClienteServico();

  // Resumo legível para o comercial ver logo o essencial na ficha.
  const objetivosTxt = (dados.objetivos ?? [])
    .map((o) => OBJETIVOS.find(([k]) => k === o)?.[1] ?? o)
    .join(", ");
  const presencaTxt = rotulo("presenca", dados.presenca);
  const resumo = [
    presencaTxt ? `Presença: ${presencaTxt}.` : "",
    objetivosTxt ? `Quer: ${objetivosTxt}.` : "",
    dados.mensagem?.trim() ? `Disse: "${dados.mensagem.trim()}"` : "",
  ]
    .filter(Boolean)
    .join(" ");

  const { data: cliente, error } = await supabase
    .from("clientes")
    .insert({
      nome_marca: marca,
      setor: dados.setor?.trim() || null,
      estado: "lead",
      notas_gerais: resumo || null,
    })
    .select("id, intake_token")
    .single();
  if (error || !cliente) return { ok: false as const, erro: "Não conseguimos registar agora. Tenta outra vez." };

  await supabase.from("contactos").insert({
    cliente_id: cliente.id,
    nome: dados.nome?.trim() || marca,
    email,
    telefone: dados.telefone?.trim() || null,
    principal: true,
  });

  // Diagnóstico leve (sem depender da coluna brief da migração 0017).
  await supabase.from("diagnosticos").insert({
    cliente_id: cliente.id,
    origem: "cliente",
    estado: "rascunho",
    objetivos: { selecionados: dados.objetivos ?? [], texto_livre: "" },
    estado_atual: { site: "", notas: presencaTxt ?? "" },
  });

  await supabase.from("atividades").insert({
    cliente_id: cliente.id,
    tipo: "nota",
    descricao: "🌐 Lead entrou pelo site — diagnóstico rápido.",
  });

  return { ok: true as const, token: (cliente.intake_token as string) ?? null };
}
