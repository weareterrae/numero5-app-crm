"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { criarClienteServidor } from "@/lib/supabase/server";
import type { ConteudoProposta } from "@/lib/ia/prompts/proposta";

const t = (v: FormDataEntryValue | null) => {
  const s = (v ?? "").toString().trim();
  return s === "" ? null : s;
};

/** Cria uma proposta, herdando do diagnóstico mais recente se existir. */
export async function criarProposta(formData: FormData) {
  const clienteId = (formData.get("cliente_id") ?? "").toString();
  if (!clienteId) return;

  const supabase = await criarClienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: diag } = await supabase
    .from("diagnosticos")
    .select("id, pacote_sugerido")
    .eq("cliente_id", clienteId)
    .order("versao", { ascending: false })
    .limit(1)
    .maybeSingle();

  // O pedido do cliente vem da migração 0008; lê-se à parte, de forma
  // tolerante, para a criação de propostas não partir antes dela correr.
  let pedido: Record<string, unknown> = {};
  if (diag?.id) {
    const { data: pd } = await supabase
      .from("diagnosticos")
      .select("pedido")
      .eq("id", diag.id)
      .maybeSingle();
    pedido = (pd?.pedido as Record<string, unknown>) ?? {};
  }

  const chave = diag?.pacote_sugerido ?? "motor";
  const { data: pacote } = await supabase
    .from("pacotes")
    .select("id, ambito_default, setup_min, setup_max, avenca_min")
    .eq("chave", chave)
    .maybeSingle();

  const novaProposta: Record<string, unknown> = {
    cliente_id: clienteId,
    diagnostico_id: diag?.id ?? null,
    pacote_id: pacote?.id ?? null,
    criado_por: user?.id ?? null,
    ambito: pacote?.ambito_default ?? [],
    setup_valor: pacote?.setup_min ?? null,
    avenca_valor: pacote?.avenca_min ?? null,
  };
  // Só inclui o pedido se existir (e, logo, se a migração 0008 já correu).
  if (Object.keys(pedido).length) novaProposta.escopo_pedido = pedido;

  const { data, error } = await supabase.from("propostas").insert(novaProposta).select("id").single();

  if (error || !data) return;
  revalidatePath(`/clientes/${clienteId}`);
  redirect(`/propostas/${data.id}`);
}

/**
 * Cria a proposta a partir de UM diagnóstico concreto (o do cliente ou o nosso).
 * Herda o pedido do cliente e sugere casos pelo setor. É o caminho natural:
 * abrir o diagnóstico → daqui sai a proposta.
 */
export async function criarPropostaDeDiagnostico(formData: FormData) {
  const diagnosticoId = (formData.get("diagnostico_id") ?? "").toString();
  if (!diagnosticoId) return;

  const supabase = await criarClienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: diag } = await supabase
    .from("diagnosticos")
    .select("id, cliente_id, pacote_sugerido, pedido")
    .eq("id", diagnosticoId)
    .maybeSingle();
  if (!diag) return;

  const { data: cliente } = await supabase
    .from("clientes")
    .select("setor")
    .eq("id", diag.cliente_id)
    .maybeSingle();

  const chave = diag.pacote_sugerido ?? "motor";
  const { data: pacote } = await supabase
    .from("pacotes")
    .select("id, ambito_default, setup_min, avenca_min")
    .eq("chave", chave)
    .maybeSingle();

  // Sugerir casos cujo setor partilha palavras com o do cliente.
  let casos: string[] = [];
  try {
    const { data: todos } = await supabase.from("casos").select("chave, setor").eq("ativo", true);
    const palavras = (cliente?.setor ?? "")
      .toLowerCase()
      .split(/[\s/,]+/)
      .filter((w: string) => w.length > 3);
    casos = (todos ?? [])
      .filter((c) => palavras.some((w: string) => (c.setor ?? "").toLowerCase().includes(w)))
      .map((c) => c.chave)
      .slice(0, 3);
  } catch {
    /* tabela ainda sem migração — segue sem casos */
  }

  const nova: Record<string, unknown> = {
    cliente_id: diag.cliente_id,
    diagnostico_id: diag.id,
    pacote_id: pacote?.id ?? null,
    criado_por: user?.id ?? null,
    ambito: pacote?.ambito_default ?? [],
    setup_valor: pacote?.setup_min ?? null,
    avenca_valor: pacote?.avenca_min ?? null,
  };
  const pedido = (diag.pedido as Record<string, unknown>) ?? {};
  if (Object.keys(pedido).length) nova.escopo_pedido = pedido;
  if (casos.length) nova.casos = casos;

  const { data, error } = await supabase.from("propostas").insert(nova).select("id").single();
  if (error || !data) return;
  revalidatePath(`/clientes/${diag.cliente_id}`);
  redirect(`/propostas/${data.id}`);
}

/** Guarda o conteúdo e os valores da proposta. */
export async function guardarProposta(formData: FormData) {
  const id = (formData.get("id") ?? "").toString();
  if (!id) return;

  const supabase = await criarClienteServidor();
  const pacoteId = t(formData.get("pacote_id"));

  // NÃO mexe em ambito/setup_valor/avenca_valor — esses são do configurador
  // (fonte única do preço). Aqui só o pacote, as notas e o interruptor.
  await supabase
    .from("propostas")
    .update({
      ...(pacoteId ? { pacote_id: pacoteId } : {}),
      setup_nota: t(formData.get("setup_nota")),
      avenca_nota: t(formData.get("avenca_nota")),
      mostrar_comparacao: formData.get("mostrar_comparacao") === "on",
    })
    .eq("id", id);

  revalidatePath(`/propostas/${id}`);
}

/**
 * Guarda o âmbito estruturado e escreve os valores calculados na proposta.
 * O âmbito em texto passa a ser derivado do configurador — deixa de haver
 * diferença entre o que se orçamenta e o que se promete ao cliente.
 */
export async function guardarEscopo(
  id: string,
  escopo: unknown,
  ambito: string[],
  totalMensal: number,
  totalSetup: number,
  aud?: {
    motivo?: string | null;
    mensalCalculado?: number;
    setupCalculado?: number;
    direcaoExcecao?: string | null;
  },
) {
  const supabase = await criarClienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { error } = await supabase
    .from("propostas")
    .update({
      escopo,
      ambito,
      avenca_valor: totalMensal > 0 ? totalMensal : null,
      setup_valor: totalSetup > 0 ? totalSetup : null,
    })
    .eq("id", id);
  if (error) return { ok: false as const, erro: error.message };

  // Auditoria: proposta abaixo do valor calculado pelo catálogo.
  if (aud) {
    const abaixoM = aud.mensalCalculado != null && totalMensal < aud.mensalCalculado;
    const abaixoS = aud.setupCalculado != null && totalSetup < aud.setupCalculado;
    if (abaixoM || abaixoS) {
      await supabase.from("auditoria").insert({
        tabela: "propostas",
        registo_id: id,
        campo: "abaixo_do_catalogo",
        valor_anterior: `mensal ${aud.mensalCalculado ?? "—"} · setup ${aud.setupCalculado ?? "—"}`,
        valor_novo: `mensal ${totalMensal} · setup ${totalSetup}`,
        motivo: aud.motivo ?? null,
        autor_id: user?.id ?? null,
      });
    }
    // Auditoria: avença fechada sem direção e coordenação (exceção justificada).
    if (aud.direcaoExcecao) {
      await supabase.from("auditoria").insert({
        tabela: "propostas",
        registo_id: id,
        campo: "avenca_sem_direcao",
        valor_anterior: "direção obrigatória",
        valor_novo: "exceção autorizada",
        motivo: aud.direcaoExcecao,
        autor_id: user?.id ?? null,
      });
    }
  }

  revalidatePath(`/propostas/${id}`);
  return { ok: true as const };
}

/** Guarda a tabela de preços unitários. */
export async function guardarPrecos(formData: FormData) {
  const supabase = await criarClienteServidor();
  const porChave = new Map<string, { preco: number | null; minutos: number | null }>();

  for (const [campo, valor] of formData.entries()) {
    const m = campo.match(/^(preco|minutos)__(.+)$/);
    if (!m) continue;
    const [, tipo, chave] = m;
    const s = valor.toString().trim().replace(",", ".");
    const num = s === "" ? null : Number(s);
    const atual = porChave.get(chave) ?? { preco: null, minutos: null };
    if (tipo === "preco") atual.preco = Number.isFinite(num as number) ? (num as number) : null;
    else atual.minutos = Number.isFinite(num as number) ? Math.round(num as number) : null;
    porChave.set(chave, atual);
  }

  for (const [chave, v] of porChave) {
    await supabase.from("precos_unitarios").update(v).eq("chave", chave);
  }
  revalidatePath("/definicoes/precos");
}

/** Guarda os casos (provas reais) que aparecem na proposta. */
export async function guardarCasos(id: string, chaves: string[]) {
  const supabase = await criarClienteServidor();
  const { error } = await supabase.from("propostas").update({ casos: chaves }).eq("id", id);
  if (error) return { ok: false as const, erro: error.message };
  revalidatePath(`/propostas/${id}`);
  return { ok: true as const };
}

/** Acrescenta um serviço novo ao catálogo (vídeo, fotografia, apps…). */
export async function criarServico(formData: FormData) {
  const rotulo = t(formData.get("rotulo"));
  const tipo = t(formData.get("tipo"));
  const unidade = t(formData.get("unidade")) ?? "unidade";
  if (!rotulo || !["mensal", "setup"].includes(tipo ?? "")) return;

  const precoRaw = (formData.get("preco") ?? "").toString().trim().replace(",", ".");
  const preco = precoRaw === "" ? null : Number(precoRaw);

  const slug = rotulo
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 24);
  const chave = `svc_${slug}_${Math.random().toString(36).slice(2, 7)}`;

  const supabase = await criarClienteServidor();
  await supabase.from("precos_unitarios").insert({
    chave,
    rotulo,
    descricao: t(formData.get("descricao")),
    categoria: t(formData.get("categoria")) ?? "Outros",
    tipo,
    unidade,
    preco: preco !== null && Number.isFinite(preco) ? preco : null,
    ativo: true,
    ordem: 100,
  });
  revalidatePath("/definicoes/precos");
}

/** Desativa um serviço do catálogo (não apaga — mantém o histórico das propostas).
 *  Recebe a chave por bind, para poder viver dentro do form de preços sem aninhar. */
export async function desativarServico(chave: string, _formData: FormData) {
  if (!chave) return;
  const supabase = await criarClienteServidor();
  await supabase
    .from("precos_unitarios")
    .update({ ativo: false, estado: "inativo" })
    .eq("chave", chave);
  revalidatePath("/definicoes/precos");
}

/** Guarda TODOS os campos comerciais de um serviço do catálogo, com auditoria
 *  ao preço (Fase 2 do sistema comercial). */
export async function guardarServico(formData: FormData) {
  const chave = t(formData.get("chave"));
  const rotulo = t(formData.get("rotulo"));
  if (!chave || !rotulo) return;

  const num = (k: string) => {
    const s = (formData.get(k) ?? "").toString().trim().replace(",", ".");
    if (s === "") return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  };
  const int = (k: string) => {
    const n = num(k);
    return n === null ? null : Math.round(n);
  };

  const supabase = await criarClienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: antes } = await supabase
    .from("precos_unitarios")
    .select("preco")
    .eq("chave", chave)
    .maybeSingle();

  const estado = t(formData.get("estado")) ?? "ativo";
  const novoPreco = num("preco");

  await supabase
    .from("precos_unitarios")
    .update({
      rotulo,
      rotulo_en: t(formData.get("rotulo_en")),
      categoria: t(formData.get("categoria")),
      cobranca: t(formData.get("cobranca")),
      unidade: t(formData.get("unidade")) ?? "unidade",
      estado,
      ativo: estado === "ativo",
      preco: novoPreco,
      preco_minimo: num("preco_minimo"),
      percentagem: num("percentagem"),
      minutos: int("minutos"),
      custo_interno: num("custo_interno"),
      custo_externo: num("custo_externo"),
      tempo_planeado_min: int("tempo_planeado_min"),
      limite_revisoes: int("limite_revisoes"),
      descricao_interna: t(formData.get("descricao_interna")),
      desc_cliente_pt: t(formData.get("desc_cliente_pt")),
      desc_cliente_en: t(formData.get("desc_cliente_en")),
      inclusoes: t(formData.get("inclusoes")),
      exclusoes: t(formData.get("exclusoes")),
      dependencias: t(formData.get("dependencias")),
      notas_internas: t(formData.get("notas_internas")),
      permite_desconto: formData.get("permite_desconto") === "on",
      mostrar_discriminado: formData.get("mostrar_discriminado") === "on",
    })
    .eq("chave", chave);

  const antesP = antes?.preco ?? null;
  if (String(antesP) !== String(novoPreco)) {
    await supabase.from("auditoria").insert({
      tabela: "precos_unitarios",
      registo_id: chave,
      campo: "preco",
      valor_anterior: antesP === null ? null : String(antesP),
      valor_novo: novoPreco === null ? null : String(novoPreco),
      motivo: t(formData.get("motivo")),
      autor_id: user?.id ?? null,
    });
  }
  revalidatePath("/definicoes/precos");
}

/** Guarda o texto vindo da IA (ou editado à mão). */
export async function guardarConteudo(id: string, conteudo: ConteudoProposta) {
  const supabase = await criarClienteServidor();
  const { error } = await supabase.from("propostas").update({ conteudo }).eq("id", id);
  if (error) return { ok: false as const, erro: error.message };
  revalidatePath(`/propostas/${id}`);
  return { ok: true as const };
}

/**
 * Muda o estado da proposta. Os gatilhos da base de dados encarregam-se
 * de mover o cliente no funil e de criar a avença quando é aceite.
 */
export async function mudarEstadoProposta(formData: FormData) {
  const id = (formData.get("id") ?? "").toString();
  const estado = (formData.get("estado") ?? "").toString();
  if (!id || !["rascunho", "enviada", "aceite", "recusada"].includes(estado)) return;

  const motivo = t(formData.get("motivo_recusa"));
  if (estado === "recusada" && !motivo) return;

  const supabase = await criarClienteServidor();
  const { data: p } = await supabase
    .from("propostas")
    .select("cliente_id")
    .eq("id", id)
    .maybeSingle();

  await supabase
    .from("propostas")
    .update({ estado, ...(estado === "recusada" ? { motivo_recusa: motivo } : {}) })
    .eq("id", id);

  revalidatePath(`/propostas/${id}`);
  if (p) revalidatePath(`/clientes/${p.cliente_id}`);
  revalidatePath("/");
  revalidatePath("/avencas");
  revalidatePath("/clientes/funil");
}

/** Guarda as condições comerciais obrigatórias da proposta (validade, inclui/
 *  exclui, prazo de arranque, política de revisões, forma de pagamento). */
export async function guardarCondicoes(formData: FormData) {
  const id = (formData.get("id") ?? "").toString();
  if (!id) return;

  const numero = (v: FormDataEntryValue | null) => {
    const s = (v ?? "").toString().trim();
    if (s === "") return null;
    const x = Number(s);
    return Number.isFinite(x) ? Math.round(x) : null;
  };
  const condicoes = {
    inclui: t(formData.get("inclui")),
    exclui: t(formData.get("exclui")),
    prazo_arranque: t(formData.get("prazo_arranque")),
    politica_revisoes: t(formData.get("politica_revisoes")),
    forma_pagamento: t(formData.get("forma_pagamento")),
    // Duração e renovação (blocos 5+6).
    data_inicio: t(formData.get("data_inicio")),
    duracao_meses: numero(formData.get("duracao_meses")),
    aviso_dias: numero(formData.get("aviso_dias")),
    renovacao: t(formData.get("renovacao")), // automatica | manual
    // Pagamento da Fundação.
    pagamento_fundacao: t(formData.get("pagamento_fundacao")), // 50_50 | 100 | fases
    pagamento_fundacao_fases: t(formData.get("pagamento_fundacao_fases")),
    // Moeda local (ex.: Angola) — nota manual e honesta, escrita pelo operador
    // (ex.: «Equivalente indicativo: 950 000 Kz/mês · câmbio de referência de 27-07-2026»).
    // Sem conversão automática: nunca inventamos câmbios.
    moeda_nota: t(formData.get("moeda_nota")),
  };

  const supabase = await criarClienteServidor();
  await supabase
    .from("propostas")
    .update({ validade: t(formData.get("validade")), condicoes })
    .eq("id", id);

  revalidatePath(`/propostas/${id}`);
}

/**
 * Congela uma fotografia imutável da proposta: preços, âmbito, condições,
 * descontos e valores no momento. Alterar o catálogo depois não mexe nas
 * versões antigas. Devolve o número da versão criada.
 */
export async function congelarVersao(propostaId: string, motivo?: string | null) {
  const supabase = await criarClienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: p } = await supabase
    .from("propostas")
    .select(
      "cliente_id, escopo, escopo_pedido, condicoes, validade, avenca_valor, setup_valor, ambito, mostrar_comparacao",
    )
    .eq("id", propostaId)
    .maybeSingle();
  if (!p) return { ok: false as const, erro: "Proposta não encontrada." };

  const [{ data: precos }, { data: descontos }, { data: ultima }] = await Promise.all([
    supabase
      .from("precos_unitarios")
      .select("chave, rotulo, tipo, unidade, preco, minutos")
      .neq("estado", "inativo"),
    supabase.from("descontos").select("*").eq("cliente_id", p.cliente_id).eq("estado", "ativo").then(
      (r) => r,
      () => ({ data: [] }),
    ),
    supabase
      .from("proposta_versoes")
      .select("versao")
      .eq("proposta_id", propostaId)
      .order("versao", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const versao = (ultima?.versao ?? 0) + 1;
  const snapshot = {
    data: new Date().toISOString(),
    precos: precos ?? [],
    escopo: p.escopo,
    escopo_pedido: p.escopo_pedido,
    condicoes: p.condicoes,
    validade: p.validade,
    mostrar_comparacao: p.mostrar_comparacao,
    descontos: descontos ?? [],
  };

  const { error } = await supabase.from("proposta_versoes").insert({
    proposta_id: propostaId,
    versao,
    snapshot,
    avenca_valor: p.avenca_valor,
    setup_valor: p.setup_valor,
    ambito: p.ambito,
    motivo: motivo ?? null,
    enviada: true,
    autor_id: user?.id ?? null,
  });
  if (error) return { ok: false as const, erro: error.message };

  revalidatePath(`/propostas/${propostaId}`);
  return { ok: true as const, versao };
}

export async function congelarVersaoForm(formData: FormData) {
  const id = (formData.get("id") ?? "").toString();
  if (!id) return;
  await congelarVersao(id, (formData.get("motivo") ?? "").toString().trim() || null);
}

export async function alternarPartilhaProposta(formData: FormData) {
  const id = (formData.get("id") ?? "").toString();
  const ativar = formData.get("ativar") === "1";
  if (!id) return;
  const supabase = await criarClienteServidor();
  await supabase.from("propostas").update({ partilha_ativa: ativar }).eq("id", id);

  if (ativar) {
    // Partilhar o link É apresentar a proposta: se ainda está em rascunho, passa
    // a «enviada» — o gatilho da BD move o cliente para «proposta» no funil.
    const { data: p } = await supabase
      .from("propostas")
      .select("estado, cliente_id")
      .eq("id", id)
      .maybeSingle();
    if (p?.estado === "rascunho") {
      await supabase.from("propostas").update({ estado: "enviada" }).eq("id", id);
      if (p.cliente_id) {
        revalidatePath(`/clientes/${p.cliente_id}`);
        revalidatePath("/");
        revalidatePath("/clientes/funil");
      }
    }

    // Congela a v1 se ainda não houver — o que o cliente vê fica imutável.
    const { data: existe } = await supabase
      .from("proposta_versoes")
      .select("id")
      .eq("proposta_id", id)
      .limit(1)
      .maybeSingle()
      .then((r) => r, () => ({ data: null }));
    if (!existe) await congelarVersao(id, "primeira partilha");
  }

  revalidatePath(`/propostas/${id}`);
}

/** Guarda um desconto (condição de lançamento) para o cliente. Calcula o preço
 *  durante e depois, e regista na auditoria. Um desconto ativo por alvo. */
export async function guardarDesconto(formData: FormData) {
  const clienteId = t(formData.get("cliente_id"));
  const propostaId = t(formData.get("proposta_id"));
  if (!clienteId) return;
  const alvo = t(formData.get("alvo")) === "setup" ? "setup" : "avenca";

  const num = (k: string) => {
    const s = (formData.get(k) ?? "").toString().trim().replace(",", ".");
    const n = Number(s);
    return Number.isFinite(n) ? n : 0;
  };
  const valorNormal = alvo === "setup" ? num("setup_valor") : num("avenca_valor");
  const tipo = t(formData.get("tipo")) === "fixo" ? "fixo" : "percentagem";
  const valorDesconto = num("valor_desconto");
  const duracao = Math.max(0, Math.round(num("duracao_meses")));
  const inicio = t(formData.get("inicio"));
  const precoDurante = Math.max(
    0,
    tipo === "percentagem" ? valorNormal * (1 - valorDesconto / 100) : valorNormal - valorDesconto,
  );

  let fim: string | null = null;
  if (inicio && duracao > 0) {
    const [y, m, d] = inicio.split("-").map(Number);
    const dt = new Date(y, m - 1 + duracao, d);
    fim = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
  }

  const supabase = await criarClienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  await supabase
    .from("descontos")
    .delete()
    .eq("cliente_id", clienteId)
    .eq("alvo", alvo)
    .eq("estado", "ativo");
  await supabase.from("descontos").insert({
    cliente_id: clienteId,
    proposta_id: propostaId,
    alvo,
    valor_normal: valorNormal,
    tipo,
    valor_desconto: valorDesconto,
    preco_durante: Math.round(precoDurante * 100) / 100,
    preco_apos: valorNormal,
    motivo: t(formData.get("motivo")),
    inicio: inicio ?? null,
    duracao_meses: duracao || null,
    fim,
    autor_id: user?.id ?? null,
    notas: t(formData.get("notas")),
  });
  await supabase.from("auditoria").insert({
    tabela: "descontos",
    registo_id: clienteId,
    campo: `desconto_${alvo}`,
    valor_anterior: String(valorNormal),
    valor_novo: String(Math.round(precoDurante)),
    motivo: t(formData.get("motivo")),
    autor_id: user?.id ?? null,
  });

  if (propostaId) revalidatePath(`/propostas/${propostaId}`);
}

export async function apagarDesconto(id: string, _fd: FormData) {
  if (!id) return;
  const supabase = await criarClienteServidor();
  const { data } = await supabase.from("descontos").select("proposta_id").eq("id", id).maybeSingle();
  await supabase.from("descontos").delete().eq("id", id);
  if (data?.proposta_id) revalidatePath(`/propostas/${data.proposta_id}`);
}
