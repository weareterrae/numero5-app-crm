"use server";

import { revalidatePath } from "next/cache";
import { criarClienteServidor } from "@/lib/supabase/server";
import {
  criarFaturaRascunho,
  finalizarFatura,
  obterFatura,
  obterPdfUrl,
  enviarFaturaEmail,
  criarRecibo,
  criarNotaCreditoRascunho,
} from "@/lib/faturacao/invoicexpress";
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

  // Recibo automático: se há fatura emitida e ainda não há recibo, cria-o no
  // InvoiceXpress e anexa. Tolerante (0060) — nunca trava o marcar cobrado.
  if (cobrado) {
    try {
      const { data: cob } = await supabase
        .from("cobrancas")
        .select("id, valor, fatura_ix_id, fatura_ix_estado, recibo_ix_id")
        .eq("cliente_id", clienteId)
        .eq("mes", mes)
        .eq("tipo", tipo)
        .maybeSingle();
      if (cob?.fatura_ix_id && cob.fatura_ix_estado === "final" && !cob.recibo_ix_id) {
        const r = await criarRecibo(Number(cob.fatura_ix_id), Number(cob.valor) || 0);
        if (r.ok) {
          const pdf = await obterPdfUrl(r.id, 3); // PDF do recibo, para o cliente descarregar na Sede
          await supabase
            .from("cobrancas")
            .update({ recibo_ix_id: r.id, recibo_ix_url: r.url, recibo_ix_pdf: pdf })
            .eq("id", cob.id);
          await supabase.from("atividades").insert({
            cliente_id: clienteId,
            tipo: "nota",
            descricao: `🧾 Recibo criado no InvoiceXpress e anexado (pagamento da avença).`,
          });
        }
      }
    } catch {
      /* recibo é conveniência — nunca trava a cobrança */
    }
  }

  revalidatePath("/faturacao");
}

/**
 * EMITE a fatura da avença do mês no InvoiceXpress: cria, finaliza (número
 * legal — irreversível, por isso é sempre um clique do operador), vai buscar
 * o número e o PDF, e anexa tudo à cobrança (visível na ficha e na Sede).
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
    // Finaliza (número legal) + número + PDF. Se algo falhar a meio, guardamos
    // o que temos — o operador vê o estado e resolve no IX.
    const fin = await finalizarFatura(r.id);
    const info = fin.ok ? await obterFatura(r.id) : null;
    const numero = info && info.ok ? info.numero : null;
    const estado = fin.ok ? "final" : r.estado;
    const pdf = fin.ok ? await obterPdfUrl(r.id) : null;

    await supabase.from("cobrancas").upsert(
      {
        cliente_id: clienteId,
        mes,
        tipo,
        valor,
        fatura_ix_id: r.id,
        fatura_ix_url: r.url,
        fatura_ix_estado: estado,
        fatura_ix_numero: numero,
        fatura_ix_pdf: pdf,
        criado_por: user?.id ?? null,
      },
      { onConflict: "cliente_id,mes,tipo" },
    );
    await supabase.from("atividades").insert({
      cliente_id: clienteId,
      tipo: "nota",
      descricao: fin.ok
        ? `🧾 Fatura ${numero ?? ""} emitida no InvoiceXpress (${mesLegivel(mes)}) e anexada à ficha.`
        : `⚠️ Fatura criada mas não finalizada no InvoiceXpress (${mesLegivel(mes)}): ${fin.erro ?? "?"} — finalizar lá.`,
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

/** Envia a fatura ao cliente por email, pelo próprio InvoiceXpress. */
export async function enviarFaturaEmailIX(formData: FormData) {
  const clienteId = t(formData.get("cliente_id"));
  const faturaId = Number(t(formData.get("fatura_ix_id")));
  if (!clienteId || !Number.isFinite(faturaId) || faturaId <= 0) return;
  const supabase = await criarClienteServidor();

  const { data: contacto } = await supabase
    .from("contactos")
    .select("email")
    .eq("cliente_id", clienteId)
    .eq("principal", true)
    .limit(1)
    .maybeSingle();
  if (!contacto?.email) {
    await supabase.from("atividades").insert({
      cliente_id: clienteId,
      tipo: "nota",
      descricao: "⚠️ Não enviei a fatura: o cliente não tem contacto principal com email.",
    });
    revalidatePath("/faturacao");
    return;
  }

  const r = await enviarFaturaEmail(faturaId, contacto.email);
  await supabase.from("atividades").insert({
    cliente_id: clienteId,
    tipo: "nota",
    descricao: r.ok
      ? `📧 Fatura enviada por email ao cliente (${contacto.email}) via InvoiceXpress.`
      : `⚠️ Falhou o envio da fatura por email: ${r.erro ?? "?"}`,
  });
  revalidatePath("/faturacao");
}

/** Cria a NOTA DE CRÉDITO (rascunho) da fatura — finaliza-se no IX, com revisão. */
export async function criarNotaCreditoIX(formData: FormData) {
  const clienteId = t(formData.get("cliente_id"));
  const mes = t(formData.get("mes"));
  const tipo = t(formData.get("tipo")) ?? "avenca";
  if (!clienteId || !mes) return;
  const supabase = await criarClienteServidor();

  const { data: cob } = await supabase
    .from("cobrancas")
    .select("id, valor, fatura_ix_id, nc_ix_id")
    .eq("cliente_id", clienteId)
    .eq("mes", mes)
    .eq("tipo", tipo)
    .maybeSingle();
  if (!cob?.fatura_ix_id || cob.nc_ix_id) return; // sem fatura, ou NC já criada

  const { data: cli } = await supabase
    .from("clientes")
    .select("nome_marca, empresa_fiscal, nif")
    .eq("id", clienteId)
    .maybeSingle();
  if (!cli) return;

  const r = await criarNotaCreditoRascunho(Number(cob.fatura_ix_id), {
    nome: cli.empresa_fiscal || cli.nome_marca,
    nif: cli.nif,
  }, [
    {
      nome: `Regularização — ${mesLegivel(mes)}`,
      descricao: `Nota de crédito sobre a avença de ${mesLegivel(mes)}`,
      preco_unitario: Number(cob.valor) || 0,
    },
  ]);

  if (r.ok) {
    await supabase.from("cobrancas").update({ nc_ix_id: r.id, nc_ix_url: r.url }).eq("id", cob.id);
  }
  await supabase.from("atividades").insert({
    cliente_id: clienteId,
    tipo: "nota",
    descricao: r.ok
      ? `↩️ Nota de crédito em rascunho criada no InvoiceXpress (${mesLegivel(mes)}) — rever e finalizar lá.`
      : `⚠️ Falhou criar a nota de crédito: ${r.erro}`,
  });
  revalidatePath("/faturacao");
}
