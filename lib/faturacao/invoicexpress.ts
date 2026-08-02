/**
 * Integração com o InvoiceXpress (faturação certificada em Portugal).
 *
 *   INVOICEXPRESS_ACCOUNT  = nome da conta (o subdomínio: ACCOUNT.app.invoicexpress.com)
 *   INVOICEXPRESS_API_KEY  = a chave da API (Conta → Integrações → API)
 *
 * ⚠️ Prudência fiscal: emitir (finalizar) atribui número legal e é
 * irreversível — só se corrige com nota de crédito. Por isso a emissão é
 * sempre um CLIQUE do operador (nunca um cron às cegas), e as notas de
 * crédito nascem em rascunho para finalizar no InvoiceXpress.
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

// ── Ciclo completo ───────────────────────────────────────────────────────────

type Cfg = { base: string; chave: string };
function cfgOuErro(): Cfg | null {
  const conta = process.env.INVOICEXPRESS_ACCOUNT?.trim();
  const chave = process.env.INVOICEXPRESS_API_KEY?.trim();
  if (!conta || !chave) return null;
  return { base: `https://${conta}.app.invoicexpress.com`, chave };
}
const H = { "content-type": "application/json", accept: "application/json" };

/** Finaliza a fatura (atribui o número legal). IRREVERSÍVEL — só clique humano. */
export async function finalizarFatura(id: number): Promise<{ ok: boolean; erro?: string }> {
  const c = cfgOuErro();
  if (!c) return { ok: false, erro: "InvoiceXpress por configurar." };
  try {
    const r = await fetch(`${c.base}/invoices/${id}/change-state.json?api_key=${encodeURIComponent(c.chave)}`, {
      method: "PUT",
      headers: H,
      body: JSON.stringify({ invoice: { state: "finalized" } }),
    });
    if (!r.ok) return { ok: false, erro: `finalizar → ${r.status}: ${(await r.text()).slice(0, 160)}` };
    return { ok: true };
  } catch (e) {
    return { ok: false, erro: String(e) };
  }
}

/** Lê a fatura (número sequencial, estado). */
export async function obterFatura(
  id: number,
): Promise<{ ok: true; numero: string | null; estado: string } | { ok: false; erro: string }> {
  const c = cfgOuErro();
  if (!c) return { ok: false, erro: "InvoiceXpress por configurar." };
  try {
    const r = await fetch(`${c.base}/invoices/${id}.json?api_key=${encodeURIComponent(c.chave)}`, { headers: H });
    if (!r.ok) return { ok: false, erro: `obter → ${r.status}` };
    const d = (await r.json()) as { invoice?: { inverted_sequence_number?: string; sequence_number?: string; state?: string } };
    return {
      ok: true,
      numero: d.invoice?.inverted_sequence_number || d.invoice?.sequence_number || null,
      estado: d.invoice?.state || "?",
    };
  } catch (e) {
    return { ok: false, erro: String(e) };
  }
}

/** URL do PDF (o InvoiceXpress gera-o; 202 = ainda a gerar → repetimos). */
export async function obterPdfUrl(id: number, tentativas = 4): Promise<string | null> {
  const c = cfgOuErro();
  if (!c) return null;
  for (let i = 0; i < tentativas; i++) {
    try {
      const r = await fetch(`${c.base}/api/pdf/${id}.json?api_key=${encodeURIComponent(c.chave)}`, { headers: H });
      if (r.status === 200) {
        const d = (await r.json()) as { output?: { pdfUrl?: string } };
        if (d.output?.pdfUrl) return d.output.pdfUrl;
      }
      if (r.status !== 202) return null;
    } catch {
      return null;
    }
    await new Promise((res) => setTimeout(res, 1200));
  }
  return null;
}

/** Envia a fatura por email ao cliente, através do próprio InvoiceXpress. */
export async function enviarFaturaEmail(id: number, email: string): Promise<{ ok: boolean; erro?: string }> {
  const c = cfgOuErro();
  if (!c) return { ok: false, erro: "InvoiceXpress por configurar." };
  try {
    const r = await fetch(`${c.base}/invoices/${id}/email-invoice.json?api_key=${encodeURIComponent(c.chave)}`, {
      method: "PUT",
      headers: H,
      body: JSON.stringify({ message: { client: { email, save: "0" }, cc: "", bcc: "" } }),
    });
    if (!r.ok) return { ok: false, erro: `email → ${r.status}: ${(await r.text()).slice(0, 160)}` };
    return { ok: true };
  } catch (e) {
    return { ok: false, erro: String(e) };
  }
}

/** Cria o recibo de um pagamento (total ou parcial) da fatura. */
export async function criarRecibo(
  invoiceId: number,
  valor: number,
): Promise<{ ok: true; id: number; url: string } | { ok: false; erro: string }> {
  const c = cfgOuErro();
  if (!c) return { ok: false, erro: "InvoiceXpress por configurar." };
  const hoje = new Date();
  const data = `${String(hoje.getDate()).padStart(2, "0")}/${String(hoje.getMonth() + 1).padStart(2, "0")}/${hoje.getFullYear()}`;
  try {
    const r = await fetch(`${c.base}/invoices/${invoiceId}/partial_payments.json?api_key=${encodeURIComponent(c.chave)}`, {
      method: "POST",
      headers: H,
      body: JSON.stringify({ partial_payment: { amount: valor, payment_date: data, payment_mechanism: "TB" } }),
    });
    if (!r.ok) return { ok: false, erro: `recibo → ${r.status}: ${(await r.text()).slice(0, 160)}` };
    const d = (await r.json()) as { receipt?: { id?: number } };
    if (!d.receipt?.id) return { ok: false, erro: "Resposta sem id do recibo." };
    return { ok: true, id: d.receipt.id, url: `${c.base}/receipts/${d.receipt.id}` };
  } catch (e) {
    return { ok: false, erro: String(e) };
  }
}

/** Cria uma nota de crédito (RASCUNHO) associada à fatura — finaliza-se no IX. */
export async function criarNotaCreditoRascunho(
  invoiceId: number,
  cliente: ClienteFatura,
  itens: ItemFatura[],
): Promise<{ ok: true; id: number; url: string } | { ok: false; erro: string }> {
  const c = cfgOuErro();
  if (!c) return { ok: false, erro: "InvoiceXpress por configurar." };
  if (!itens.length) return { ok: false, erro: "Sem itens." };
  const hoje = new Date();
  const data = `${String(hoje.getDate()).padStart(2, "0")}/${String(hoje.getMonth() + 1).padStart(2, "0")}/${hoje.getFullYear()}`;
  try {
    const r = await fetch(`${c.base}/credit_notes.json?api_key=${encodeURIComponent(c.chave)}`, {
      method: "POST",
      headers: H,
      body: JSON.stringify({
        credit_note: {
          date: data,
          due_date: data,
          owner_invoice_id: invoiceId,
          client: { name: cliente.nome, code: cliente.nif || cliente.nome.slice(0, 20), ...(cliente.nif ? { fiscal_id: cliente.nif } : {}) },
          items: itens.map((i) => ({
            name: i.nome.slice(0, 100),
            description: (i.descricao || i.nome).slice(0, 200),
            unit_price: i.preco_unitario,
            quantity: i.quantidade ?? 1,
            tax: { name: i.iva ?? "IVA23" },
          })),
        },
      }),
    });
    if (!r.ok) return { ok: false, erro: `nota de crédito → ${r.status}: ${(await r.text()).slice(0, 160)}` };
    const d = (await r.json()) as { credit_note?: { id?: number } };
    if (!d.credit_note?.id) return { ok: false, erro: "Resposta sem id da nota de crédito." };
    return { ok: true, id: d.credit_note.id, url: `${c.base}/credit_notes/${d.credit_note.id}` };
  } catch (e) {
    return { ok: false, erro: String(e) };
  }
}

// ── Listagens (conta corrente e mapa de pendentes) ───────────────────────────

/** Base do backoffice (para links «abrir no InvoiceXpress»), ou null. */
export function invoicexpressBase(): string | null {
  const conta = process.env.INVOICEXPRESS_ACCOUNT?.trim();
  return conta ? `https://${conta}.app.invoicexpress.com` : null;
}

export type DocIXLista = {
  id: number;
  tipo: string; // Invoice | InvoiceReceipt | SimplifiedInvoice | CreditNote
  numero: string | null;
  data: string | null; // dd/mm/yyyy
  vencimento: string | null; // dd/mm/yyyy
  cliente: string;
  total: number;
  estado: string; // draft | sent (por regularizar) | settled (paga) | canceled
  permalink: string | null;
};

const TIPOS_DOC = ["Invoice", "SimplifiedInvoice", "InvoiceReceipt", "CreditNote", "Receipt"];

/**
 * Lista documentos do InvoiceXpress. `estados`: sent = emitida por regularizar,
 * settled = paga. `texto` filtra (nome do cliente, nº…). Pagina até `maxPaginas`.
 */
export async function listarDocumentosIX(opts: {
  estados: string[];
  texto?: string;
  maxPaginas?: number;
}): Promise<{ ok: true; docs: DocIXLista[] } | { ok: false; erro: string }> {
  const c = cfgOuErro();
  if (!c) return { ok: false, erro: "InvoiceXpress por configurar." };
  const docs: DocIXLista[] = [];
  const maxPag = Math.min(opts.maxPaginas ?? 4, 10);
  try {
    for (let pag = 1; pag <= maxPag; pag++) {
      const q = new URLSearchParams();
      q.set("api_key", c.chave);
      q.set("per_page", "50");
      q.set("page", String(pag));
      q.set("non_archived", "true");
      for (const t of TIPOS_DOC) q.append("type[]", t);
      for (const s of opts.estados) q.append("status[]", s);
      if (opts.texto) q.set("text", opts.texto);
      const r = await fetch(`${c.base}/invoices.json?${q.toString()}`, {
        headers: { accept: "application/json" },
      });
      if (!r.ok) return { ok: false, erro: `listar → ${r.status}` };
      const d = (await r.json()) as {
        invoices?: Record<string, unknown>[];
        pagination?: { total_pages?: number };
      };
      for (const raw of d.invoices ?? []) {
        const cli = (raw.client ?? {}) as { name?: string };
        docs.push({
          id: Number(raw.id) || 0,
          tipo: String(raw.type ?? "Invoice"),
          numero: (raw.inverted_sequence_number as string) || (raw.sequence_number as string) || null,
          data: (raw.date as string) || null,
          vencimento: (raw.due_date as string) || null,
          cliente: cli.name || "?",
          total: Number(raw.total) || 0,
          estado: String(raw.status ?? "?"),
          permalink: (raw.permalink as string) || null,
        });
      }
      const totalPags = d.pagination?.total_pages ?? 1;
      if (pag >= totalPags) break;
    }
    return { ok: true, docs };
  } catch (e) {
    return { ok: false, erro: String(e) };
  }
}

/** Dias de atraso face ao vencimento dd/mm/yyyy (0 se não vencida/sem data). */
export function diasAtraso(vencimento: string | null, hoje = new Date()): number {
  if (!vencimento) return 0;
  const m = vencimento.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return 0;
  const v = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  const diff = Math.floor((hoje.getTime() - v.getTime()) / 86_400_000);
  return Math.max(0, diff);
}

// ── Extrato de cliente (partilhado: ficha do operador + Sede) ────────────────

export type ClasseDoc = "fatura_pendente" | "fatura_paga" | "recibo" | "nc";

/** Classifica um documento para exibição — pelo TIPO primeiro, depois estado. */
export function classificarDoc(d: DocIXLista): ClasseDoc {
  if (d.tipo === "CreditNote") return "nc";
  if (d.tipo === "Receipt") return "recibo";
  if (d.tipo === "InvoiceReceipt") return "fatura_paga"; // fatura-recibo: paga na emissão
  return d.estado === "settled" ? "fatura_paga" : "fatura_pendente";
}

export type ExtratoClienteIX = {
  ok: boolean;
  erro?: string;
  docs: DocIXLista[];
  pendente: number; // faturas por regularizar (€)
  pago: number; // faturas pagas (€)
  nc: number; // notas de crédito (€)
};

/**
 * Extrato de conta corrente de um cliente no InvoiceXpress, cruzado pelo nome
 * (fiscal ou de marca): ex.: «Quente e Bom» apanha «Doce, Quente e Bom Angola».
 */
export async function extratoClienteIX(nome: string, maxPaginas = 3): Promise<ExtratoClienteIX> {
  const chave = nome.trim().toLowerCase();
  if (!chave || !invoicexpressConfigurado()) return { ok: true, docs: [], pendente: 0, pago: 0, nc: 0 };
  const r = await listarDocumentosIX({ estados: ["sent", "settled"], texto: nome, maxPaginas });
  if (!r.ok) return { ok: false, erro: r.erro, docs: [], pendente: 0, pago: 0, nc: 0 };
  const docs = r.docs.filter((d) => d.cliente.toLowerCase().includes(chave));
  let pendente = 0,
    pago = 0,
    nc = 0;
  for (const d of docs) {
    const c = classificarDoc(d);
    if (c === "fatura_pendente") pendente += d.total;
    else if (c === "fatura_paga") pago += d.total;
    else if (c === "nc") nc += d.total;
  }
  return { ok: true, docs, pendente, pago, nc };
}

/** Impostos configurados na conta (para o seletor de IVA na emissão). */
export async function listarImpostosIX(): Promise<{ name: string; value: number }[]> {
  const c = cfgOuErro();
  if (!c) return [];
  try {
    const r = await fetch(`${c.base}/taxes.json?api_key=${encodeURIComponent(c.chave)}`, {
      headers: { accept: "application/json" },
    });
    if (!r.ok) return [];
    const d = (await r.json()) as { taxes?: { name?: string; value?: number }[] };
    return (d.taxes ?? [])
      .filter((t) => t.name)
      .map((t) => ({ name: String(t.name), value: Number(t.value) || 0 }));
  } catch {
    return [];
  }
}
