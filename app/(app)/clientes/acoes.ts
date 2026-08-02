"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { criarClienteServidor, criarClienteServico } from "@/lib/supabase/server";
import { ESTADOS, exigeMotivo, type Estado } from "@/lib/dominio/funil";
import { ONBOARDING } from "@/lib/db/clientes";

function texto(v: FormDataEntryValue | null): string | null {
  const s = (v ?? "").toString().trim();
  return s === "" ? null : s;
}

function numero(v: FormDataEntryValue | null): number | null {
  const s = (v ?? "").toString().trim().replace(",", ".");
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function lerRedes(formData: FormData): Record<string, string> {
  const redes: Record<string, string> = {};
  for (const [chave, valor] of formData.entries()) {
    if (chave.startsWith("rede_")) {
      const v = valor.toString().trim();
      if (v) redes[chave.slice(5)] = v;
    }
  }
  return redes;
}

export async function criarCliente(formData: FormData) {
  const nome = texto(formData.get("nome_marca"));
  if (!nome) return;

  const supabase = await criarClienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from("clientes")
    .insert({
      nome_marca: nome,
      setor: texto(formData.get("setor")),
      website: texto(formData.get("website")),
      origem: texto(formData.get("origem")),
      estado: (texto(formData.get("estado")) ?? "lead") as Estado,
      valor_estimado: numero(formData.get("valor_estimado")),
      notas_gerais: texto(formData.get("notas_gerais")),
      redes: lerRedes(formData),
      owner_id: user?.id ?? null,
    })
    .select("id")
    .single();

  if (error || !data) return;
  revalidatePath("/clientes");
  revalidatePath("/");
  redirect(`/clientes/${data.id}`);
}

export async function atualizarCliente(formData: FormData) {
  const id = texto(formData.get("id"));
  const nome = texto(formData.get("nome_marca"));
  if (!id || !nome) return;

  const supabase = await criarClienteServidor();
  await supabase
    .from("clientes")
    .update({
      nome_marca: nome,
      setor: texto(formData.get("setor")),
      website: texto(formData.get("website")),
      origem: texto(formData.get("origem")),
      valor_estimado: numero(formData.get("valor_estimado")),
      notas_gerais: texto(formData.get("notas_gerais")),
      redes: lerRedes(formData),
    })
    .eq("id", id);

  // Campos de colunas mais recentes (migrações 0016 / 0018). Vão num update à
  // parte: se a migração ainda não correu, isto falha em silêncio sem partir
  // a gravação dos dados base.
  await supabase
    .from("clientes")
    .update({
      idioma: formData.get("idioma") === "en" ? "en" : "pt",
      metricool_blog_id: texto(formData.get("metricool_blog_id")),
      empresa_fiscal: texto(formData.get("empresa_fiscal")),
      nif: texto(formData.get("nif")),
      morada: texto(formData.get("morada")),
      codigo_postal: texto(formData.get("codigo_postal")),
      localidade: texto(formData.get("localidade")),
      kit_logo: texto(formData.get("kit_logo")),
      kit_cores: texto(formData.get("kit_cores")),
      kit_fontes: texto(formData.get("kit_fontes")),
      kit_notas: texto(formData.get("kit_notas")),
    })
    .eq("id", id);

  revalidatePath(`/clientes/${id}`);
  revalidatePath("/clientes");
}

/** Guarda o checklist de onboarding (jsonb chave→bool). */
export async function guardarOnboarding(formData: FormData) {
  const id = texto(formData.get("id"));
  if (!id) return;
  const supabase = await criarClienteServidor();
  const estado: Record<string, boolean> = {};
  for (const [chave] of ONBOARDING) estado[chave] = formData.get(`ob_${chave}`) === "on";
  await supabase.from("clientes").update({ onboarding: estado }).eq("id", id);
  revalidatePath(`/clientes/${id}`);
}

/** Muda o estado no funil. Ao dar como perdido, o motivo é obrigatório. */
export async function mudarEstado(formData: FormData) {
  const id = texto(formData.get("id"));
  const novo = texto(formData.get("estado")) as Estado | null;
  if (!id || !novo || !ESTADOS.includes(novo)) return;

  const motivo = texto(formData.get("motivo_perda"));
  if (exigeMotivo(novo) && !motivo) return;

  const supabase = await criarClienteServidor();
  await supabase
    .from("clientes")
    .update({ estado: novo, ...(exigeMotivo(novo) ? { motivo_perda: motivo } : {}) })
    .eq("id", id);

  revalidatePath(`/clientes/${id}`);
  revalidatePath("/clientes");
  revalidatePath("/clientes/funil");
  revalidatePath("/");
}

export async function adicionarAtividade(formData: FormData) {
  const clienteId = texto(formData.get("cliente_id"));
  const descricao = texto(formData.get("descricao"));
  if (!clienteId || !descricao) return;

  const supabase = await criarClienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  await supabase.from("atividades").insert({
    cliente_id: clienteId,
    autor_id: user?.id ?? null,
    tipo: (texto(formData.get("tipo")) ?? "nota") as string,
    descricao,
    followup_em: texto(formData.get("followup_em")),
    followup_nota: texto(formData.get("followup_nota")),
  });

  revalidatePath(`/clientes/${clienteId}`);
  revalidatePath("/");
}

export async function concluirFollowup(formData: FormData) {
  const id = texto(formData.get("atividade_id"));
  const clienteId = texto(formData.get("cliente_id"));
  if (!id) return;

  const supabase = await criarClienteServidor();
  await supabase.from("atividades").update({ concluido: true }).eq("id", id);

  if (clienteId) revalidatePath(`/clientes/${clienteId}`);
  revalidatePath("/");
}

/** Apaga o cliente e tudo o que lhe está ligado (diagnósticos, propostas,
 *  avenças, produção, atividades, conversas — via ON DELETE CASCADE).
 *  O nome tem de vir escrito igual (confirmação reforçada) e fica rasto na
 *  `auditoria` — que NÃO é apagada em cascata. */
export async function apagarCliente(formData: FormData) {
  const id = texto(formData.get("id"));
  const confirmacao = texto(formData.get("confirmacao"));
  if (!id) return;
  const supabase = await criarClienteServidor();

  const { data: cliente } = await supabase
    .from("clientes")
    .select("nome_marca, estado")
    .eq("id", id)
    .maybeSingle();
  if (!cliente) return;
  // Confirmação reforçada: o nome tem de bater certo (sem depender só do browser).
  if ((confirmacao ?? "").trim().toLowerCase() !== cliente.nome_marca.trim().toLowerCase()) return;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  // Rasto ANTES de apagar — a auditoria sobrevive à remoção.
  await supabase.from("auditoria").insert({
    tabela: "clientes",
    registo_id: id,
    campo: "apagado",
    valor_anterior: `${cliente.nome_marca} (estado: ${cliente.estado})`,
    valor_novo: null,
    motivo: "Remoção definitiva pelo operador (confirmação por nome).",
    autor_id: user?.id ?? null,
  });

  await supabase.from("clientes").delete().eq("id", id);
  revalidatePath("/clientes");
  revalidatePath("/");
  redirect("/clientes");
}

export async function adicionarContacto(formData: FormData) {
  const clienteId = texto(formData.get("cliente_id"));
  const nome = texto(formData.get("nome"));
  if (!clienteId || !nome) return;

  const supabase = await criarClienteServidor();
  const novoContacto: Record<string, unknown> = {
    cliente_id: clienteId,
    nome,
    cargo: texto(formData.get("cargo")),
    email: texto(formData.get("email")),
    telefone: texto(formData.get("telefone")),
    principal: formData.get("principal") === "on",
  };
  // departamento vem da migração 0013 — só se inclui se preenchido, para não
  // partir a criação de contactos antes de a migração correr.
  const dep = texto(formData.get("departamento"));
  if (dep) novoContacto.departamento = dep;

  await supabase.from("contactos").insert(novoContacto);

  revalidatePath(`/clientes/${clienteId}`);
}

export async function apagarContacto(formData: FormData) {
  const id = texto(formData.get("contacto_id"));
  const clienteId = texto(formData.get("cliente_id"));
  if (!id) return;

  const supabase = await criarClienteServidor();
  await supabase.from("contactos").delete().eq("id", id);
  if (clienteId) revalidatePath(`/clientes/${clienteId}`);
}

export async function editarContacto(formData: FormData) {
  const id = texto(formData.get("contacto_id"));
  const clienteId = texto(formData.get("cliente_id"));
  const nome = texto(formData.get("nome"));
  if (!id || !nome) return;

  const supabase = await criarClienteServidor();
  await supabase
    .from("contactos")
    .update({
      nome,
      departamento: texto(formData.get("departamento")),
      cargo: texto(formData.get("cargo")),
      email: texto(formData.get("email")),
      telefone: texto(formData.get("telefone")),
      principal: formData.get("principal") === "on",
    })
    .eq("id", id);

  if (clienteId) revalidatePath(`/clientes/${clienteId}`);
}

/** Guarda o nível de complexidade do cliente (Fase 2, Prioridade 2). */
export async function guardarComplexidade(formData: FormData) {
  const id = (formData.get("id") ?? "").toString();
  const nivel = (formData.get("complexidade") ?? "").toString();
  if (!id || !["baixa", "media", "alta", "personalizada"].includes(nivel)) return;
  const supabase = await criarClienteServidor();
  await supabase.from("clientes").update({ complexidade: nivel }).eq("id", id);
  revalidatePath(`/clientes/${id}/rentabilidade`);
  revalidatePath(`/clientes/${id}`);
}

/** Liga uma organização da Sede (sem cliente) a esta ficha — ativa o portal. */
export async function ligarSedeOrg(formData: FormData) {
  const clienteId = (formData.get("cliente_id") ?? "").toString();
  const orgId = (formData.get("org_id") ?? "").toString();
  if (!clienteId || !orgId) return;
  const supabase = await criarClienteServidor();
  // Só liga orgs livres — nunca rouba a org de outro cliente.
  await supabase.from("orgs").update({ cliente_id: clienteId }).eq("id", orgId).is("cliente_id", null);
  await supabase.from("atividades").insert({
    cliente_id: clienteId,
    tipo: "nota",
    descricao: "🏠 Sede ligada a esta ficha (org associada).",
  });
  revalidatePath(`/clientes/${clienteId}`);
}

/**
 * Cria o acesso de um cliente à Sede: utilizador + perfil externo + adesão à
 * org + convite por email (magic link). Idempotente: repetir reenvia o convite
 * sem duplicar nada. NUNCA toca em contas da equipa (externo=false).
 */
export async function criarAcessoSede(formData: FormData) {
  const clienteId = (formData.get("cliente_id") ?? "").toString();
  const email = (formData.get("email") ?? "").toString().trim().toLowerCase();
  const nome = (formData.get("nome") ?? "").toString().trim();
  if (!clienteId || !email.includes("@")) return;

  const svc = criarClienteServico();
  const nota = (descricao: string) =>
    svc.from("atividades").insert({ cliente_id: clienteId, tipo: "nota", descricao });

  // UM convite dá acesso a TODAS as orgs desta ficha (a pessoa alterna na
  // barra de marcas dentro da Sede). Só orgs desta ficha — nunca alheias.
  const { data: orgsFicha } = await svc
    .from("orgs")
    .select("id, nome")
    .eq("cliente_id", clienteId)
    .order("nome");
  if (!orgsFicha?.length) return;

  // Guarda-corpos: se o email é de alguém da equipa, não se mexe.
  const { data: perfilExistente } = await svc
    .from("profiles")
    .select("id, externo")
    .ilike("email", email)
    .maybeSingle();
  if (perfilExistente && perfilExistente.externo === false) {
    await nota(`⚠️ Não criei acesso à Sede para ${email}: esse email é da equipa do Nº 5.`);
    revalidatePath(`/clientes/${clienteId}`);
    return;
  }

  // 1) utilizador (cria ou reutiliza)
  let userId: string | null = perfilExistente?.id ?? null;
  if (!userId) {
    const criado = await svc.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: nome ? { nome } : undefined,
    });
    userId = criado.data.user?.id ?? null;
    if (!userId) {
      // pode existir no auth sem perfil — o generateLink devolve-o sem enviar email
      const link = await svc.auth.admin.generateLink({ type: "magiclink", email });
      userId = link.data.user?.id ?? null;
    }
  }
  if (!userId) {
    await nota(`⚠️ Não consegui criar o acesso à Sede para ${email}. Tenta outra vez.`);
    revalidatePath(`/clientes/${clienteId}`);
    return;
  }

  // 2) perfil externo garantido + 3) adesão a TODAS as orgs da ficha (idempotente)
  await svc
    .from("profiles")
    .upsert({ id: userId, email, ...(nome ? { nome } : {}), externo: true }, { onConflict: "id" });
  for (const o of orgsFicha) {
    await svc
      .from("org_membros")
      .upsert(
        { org_id: o.id, profile_id: userId, papel: "cliente" },
        { onConflict: "org_id,profile_id", ignoreDuplicates: true },
      );
  }

  const nomesOrgs = orgsFicha.map((o) => o.nome).join(" + ");

  // 4) convite: gera o magic link do tipo VERIFY (token_hash) — funciona em
  //    qualquer dispositivo (ao contrário do fluxo PKCE do signInWithOtp, que
  //    prende o link ao browser de origem). Envia-se pelo Resend (fiável).
  const CALLBACK = "https://app.numerocinco.pt/auth/callback";
  const { data: linkData, error: linkErr } = await svc.auth.admin.generateLink({
    type: "magiclink",
    email,
    options: { redirectTo: CALLBACK },
  });
  let actionLink = linkData?.properties?.action_link ?? null;
  // Força o redirect_to para produção (defende-se de um Site URL mal configurado).
  if (actionLink) {
    try {
      const u = new URL(actionLink);
      u.searchParams.set("redirect_to", CALLBACK);
      actionLink = u.toString();
    } catch {
      /* mantém o original */
    }
  }

  let enviado = false;
  if (actionLink && process.env.RESEND_API_KEY) {
    const html = `
      <div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;color:#15181D">
        <p style="font-size:16px;font-weight:bold">Olá${nome ? ` ${nome}` : ""}! 🖐️</p>
        <p style="font-size:15px;line-height:1.6">O teu espaço de cliente ${nomesOrgs ? `— <b>${nomesOrgs}</b> —` : ""} está pronto. Aqui vês o teu marketing num sítio só: plano, relatórios, leads, anúncios e mais.</p>
        <p style="margin:22px 0"><a href="${actionLink}" style="background:#E8A13C;color:#15181D;font-weight:bold;padding:12px 26px;border-radius:999px;text-decoration:none;font-size:15px">Entrar na minha Sede →</a></p>
        <p style="font-size:12px;color:#9aa0a6">Este link é pessoal e válido por pouco tempo. Se expirar, entra em app.numerocinco.pt com este email e pede um novo. · Nº 5, marca operada por Os Caetanos, Lda</p>
      </div>`;
    try {
      const r = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { authorization: `Bearer ${process.env.RESEND_API_KEY}`, "content-type": "application/json" },
        body: JSON.stringify({
          from: process.env.EMAIL_REMETENTE || "Nº 5 <geral@numerocinco.pt>",
          to: [email],
          subject: `O teu acesso à Sede — ${nomesOrgs || "Nº 5"} 🖐️`,
          html,
          text: `Olá! O teu espaço de cliente está pronto. Entra aqui: ${actionLink}`,
        }),
      });
      enviado = r.ok;
    } catch {
      enviado = false;
    }
  }

  await nota(
    enviado
      ? `👤 Acesso à Sede criado para ${email} (${nomesOrgs}) — convite enviado por email. 🖐️`
      : `👤 Acesso à Sede criado para ${email} (${nomesOrgs}). Envio de email falhou — link para enviar à mão (válido ~1h): ${actionLink ?? "não gerado"}`,
  );
  revalidatePath(`/clientes/${clienteId}`);
}

/** Revoga o acesso de uma pessoa a TODAS as orgs desta ficha (a conta fica). */
export async function removerAcessoSede(formData: FormData) {
  const clienteId = (formData.get("cliente_id") ?? "").toString();
  const profileId = (formData.get("profile_id") ?? "").toString();
  if (!clienteId || !profileId) return;

  const svc = criarClienteServico();
  const { data: orgsFicha } = await svc
    .from("orgs")
    .select("id, nome")
    .eq("cliente_id", clienteId);
  if (!orgsFicha?.length) return;

  const { data: perfil } = await svc.from("profiles").select("email").eq("id", profileId).maybeSingle();
  await svc
    .from("org_membros")
    .delete()
    .in("org_id", orgsFicha.map((o) => o.id))
    .eq("profile_id", profileId);
  await svc.from("atividades").insert({
    cliente_id: clienteId,
    tipo: "nota",
    descricao: `🚪 Acesso à Sede revogado: ${perfil?.email ?? profileId} (todas as marcas da ficha).`,
  });
  revalidatePath(`/clientes/${clienteId}`);
}

/**
 * Copia os dados fiscais + responsáveis de outra ficha — para grupos com
 * várias marcas (ex.: Quente e Bom / Massa Prima / Água Minda são a mesma
 * empresa). Preenche-se UMA ficha; nas outras é um clique.
 * Contactos: só acrescenta os que ainda não existem (por email/nome).
 */
export async function copiarDadosFicha(formData: FormData) {
  const destinoId = texto(formData.get("id"));
  const origemId = texto(formData.get("copiar_origem"));
  if (!destinoId || !origemId || destinoId === origemId) return;

  const supabase = await criarClienteServidor();
  const { data: origem } = await supabase
    .from("clientes")
    .select("nome_marca, empresa_fiscal, nif, morada, codigo_postal, localidade")
    .eq("id", origemId)
    .maybeSingle();
  if (!origem) return;

  // Fiscais (update tolerante, à parte — regra da casa para colunas recentes).
  await supabase
    .from("clientes")
    .update({
      empresa_fiscal: origem.empresa_fiscal,
      nif: origem.nif,
      morada: origem.morada,
      codigo_postal: origem.codigo_postal,
      localidade: origem.localidade,
    })
    .eq("id", destinoId);

  // Responsáveis: acrescenta os que faltam, sem duplicar nem roubar o «principal».
  const [{ data: contactosOrigem }, { data: contactosDestino }] = await Promise.all([
    supabase.from("contactos").select("nome, email, telefone, departamento, principal").eq("cliente_id", origemId),
    supabase.from("contactos").select("nome, email, principal").eq("cliente_id", destinoId),
  ]);
  const jaTem = new Set(
    (contactosDestino ?? []).map((c) => (c.email || c.nome || "").trim().toLowerCase()),
  );
  const destinoTemPrincipal = (contactosDestino ?? []).some((c) => c.principal);
  let copiados = 0;
  for (const c of contactosOrigem ?? []) {
    const chave = (c.email || c.nome || "").trim().toLowerCase();
    if (!chave || jaTem.has(chave)) continue;
    await supabase.from("contactos").insert({
      cliente_id: destinoId,
      nome: c.nome,
      email: c.email,
      telefone: c.telefone,
      departamento: c.departamento,
      principal: c.principal && !destinoTemPrincipal,
    });
    jaTem.add(chave);
    copiados++;
  }

  await supabase.from("atividades").insert({
    cliente_id: destinoId,
    tipo: "nota",
    descricao: `⧉ Dados fiscais copiados da ficha «${origem.nome_marca}»${copiados ? ` + ${copiados} responsável(is)` : ""} (mesma empresa, várias marcas).`,
  });
  revalidatePath(`/clientes/${destinoId}`);
}

/** Liga a conta de anúncios Meta de uma org (marca) — para a Sede mostrar campanhas. */
export async function ligarMetaAds(formData: FormData) {
  const clienteId = texto(formData.get("cliente_id"));
  const orgId = texto(formData.get("org_id"));
  const conta = (formData.get("meta_ads_id") ?? "").toString().trim().replace(/^act_/, "");
  if (!clienteId || !orgId) return;

  const supabase = await criarClienteServidor();
  const { data: org } = await supabase
    .from("orgs")
    .select("id, nome, cliente_id")
    .eq("id", orgId)
    .maybeSingle();
  if (!org || org.cliente_id !== clienteId) return; // só orgs desta ficha

  await supabase.from("orgs").update({ meta_ads_id: conta || null }).eq("id", orgId);
  await supabase.from("atividades").insert({
    cliente_id: clienteId,
    tipo: "nota",
    descricao: conta
      ? `📣 Conta de anúncios Meta ligada à Sede (${org.nome}): act_${conta}.`
      : `📣 Conta de anúncios Meta desligada da Sede (${org.nome}).`,
  });
  revalidatePath(`/clientes/${clienteId}`);
}
