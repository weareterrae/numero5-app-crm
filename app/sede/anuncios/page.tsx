import { redirect } from "next/navigation";

/**
 * Os anúncios passaram a viver dentro de /sede/resultados — o cliente tem o orgânico e o pago
 * no mesmo sítio. Mantemos a rota a redirecionar para não partir links já enviados.
 */
export default function SedeAnuncios() {
  redirect("/sede/resultados");
}
