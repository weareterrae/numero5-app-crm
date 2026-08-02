/**
 * Integração com o InvoiceXpress (faturação certificada em Portugal).
 *
 *   INVOICEXPRESS_ACCOUNT  = nome da conta (o subdomínio: ACCOUNT.app.invoicexpress.com)
 *   INVOICEXPRESS_API_KEY  = a chave da API (Conta → Integrações → API)
 *
 * ⚠️ Prudência fiscal: por defeito criamos a fatura em RASCUNHO — a
 * finalização (que atribui número legal e comunica à AT) faz-se no
 * InvoiceXpress, com revisão humana. Nada é emitido «às cegas» pela app.
 */

export type ClienteFatura = {
  nome: string;
  nif?: string | null;
  email?: string | null;
  morada?: string | null;
  codigo_postal?: string | null;
  localidade?: string | null;
};

export type ItemFatura = {
  nome: string;
  descricao?: string | null;
  preco_unitario: number;
  quantidade?: number;
  /** Nome do imposto no InvoiceXpress (ex.: "IVA23"). */
  iva?: string;
};

export type ResultadoFatura =
  | { ok: true; id: number; sequencia: string | null; estado: string; url: string }
  | { ok: false; erro: string };

function config() {
  const conta = process.env.INVOICEXPRESS_ACCOUNT?.trim();
  const chave = process.env.INVOICEXPRESS_API_KEY?.trim();
  if (!conta || !chave) return null;
  return { base: `https://${conta}.app.invoicexpress.com`, chave, conta };
}

export function invoicexpressConfigurado(): boolean {
  return config() !== null;
}

/** Cria uma fatura (rascunho) no InvoiceXpress. */
export async function criarFaturaRascunho(
  cliente: ClienteFatura,
  itens: ItemFatura[],
  opts?: { observacoes?: string | null; vencimento_dias?: number },
): Promise<ResultadoFatura> {
  const cfg = config();
  if (!cfg)
    return {
      ok: false,
      erro: "InvoiceXpress por configurar — falta INVOICEXPRESS_ACCOUNT e INVOICEXPRESS_API_KEY nas variáveis do Netlify.",
    };
  if (!itens.length) return { ok: false, erro: "Sem itens para faturar." };

  const hoje = new Date();
  const fmt = (d: Date) =>
    `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
  const venc = new Date(hoje.getTime() + (opts?.vencimento_dias ?? 15) * 24 * 3600 * 1000);

  const corpo = {
    invoice: {
      date: fmt(hoje),
      due_date: fmt(venc),
      ...(opts?.observacoes ? { observations: opts.observacoes } : {}),
      client: {
        name: cliente.nome,
        code: cliente.nif || cliente.nome.slice(0, 20),
        ...(cliente.nif ? { fiscal_id: cliente.nif } : {}),
        ...(cliente.email ? { email: cliente.email } : {}),
        ...(cliente.morada ? { address: cliente.morada } : {}),
        ...(cliente.codigo_postal ? { postal_code: cliente.codigo_postal } : {}),
        ...(cliente.localidade ? { city: cliente.localidade } : {}),
      },
      items: itens.map((i) => ({
        name: i.nome.slice(0, 100),
        description: (i.descricao || i.nome).slice(0, 200),
        unit_price: i.preco_unitario,
        quantity: i.quantidade ?? 1,
        tax: { name: i.iva ?? "IVA23" },
      })),
    },
  };

  try {
    const r = await fetch(`${cfg.base}/invoices.json?api_key=${encodeURIComponent(cfg.chave)}`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(corpo),
    });
    if (!r.ok) {
      const t = await r.text();
      return { ok: false, erro: `InvoiceXpress respondeu ${r.status}: ${t.slice(0, 200)}` };
    }
    const d = (await r.json()) as {
      invoice?: { id?: number; inverted_sequence_number?: string; sequence_number?: string; state?: string };
    };
    const id = d.invoice?.id;
    if (!id) return { ok: false, erro: "Resposta sem id da fatura." };
    return {
      ok: true,
      id,
      sequencia: d.invoice?.inverted_sequence_number || d.invoice?.sequence_number || null,
      estado: d.invoice?.state || "draft",
      url: `${cfg.base}/invoices/${id}`,
    };
  } catch (e) {
    return { ok: false, erro: String(e) };
  }
}
