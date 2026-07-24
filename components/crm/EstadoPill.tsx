import { ESTADO_LABEL, type Estado } from "@/lib/dominio/funil";

const CORES: Record<Estado, string> = {
  lead: "bg-line/70 text-grey",
  contactado: "bg-cobalt/10 text-cobalt",
  diagnostico: "bg-gold/20 text-gold-dark",
  proposta: "bg-gold/35 text-gold-dark",
  cliente: "bg-good/15 text-good",
  perdido: "bg-line/50 text-soft line-through",
};

export function EstadoPill({ estado }: { estado: Estado }) {
  return (
    <span
      className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-bold ${CORES[estado]}`}
    >
      {ESTADO_LABEL[estado]}
    </span>
  );
}
