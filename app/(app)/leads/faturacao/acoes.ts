"use server";

import { revalidatePath } from "next/cache";
import { criarClienteServidor } from "@/lib/supabase/server";

const t = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === "string" ? v.trim() : "";
};
const num = (s: string): number | null => {
  const n = parseFloat(s.replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

async function clienteStaff() {
  const sb = await criarClienteServidor();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return null;
  const { data: p } = await sb.from("profiles").select("externo").eq("id", user.id).maybeSingle();
  if (p?.externo) return null;
  return sb;
}

/** Cria/atualiza a assinatura (plano + valores) de um cliente. Só staff. */
export async function guardarAssinatura(fd: FormData) {
  const sb = await clienteStaff();
  if (!sb) return;
  const orgId = t(fd, "org_id");
  if (!orgId) return;

  const estado = ["ativa", "pausada", "terminada"].includes(t(fd, "estado")) ? t(fd, "estado") : "ativa";
  const dia = parseInt(t(fd, "dia_cobranca"), 10);

  await sb.from("org_assinaturas").upsert(
    {
      org_id: orgId,
      plano: t(fd, "plano") || null,
      setup_valor: num(t(fd, "setup_valor")),
      setup_pago: t(fd, "setup_pago") === "on",
      avenca_valor: num(t(fd, "avenca_valor")),
      estado,
      dia_cobranca: Number.isFinite(dia) && dia >= 1 && dia <= 28 ? dia : null,
    },
    { onConflict: "org_id" },
  );
  revalidatePath("/leads/faturacao");
}
