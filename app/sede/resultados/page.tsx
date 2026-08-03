import { contextoSede } from "@/lib/sede/contexto";
import { criarClienteServico } from "@/lib/supabase/server";
import { lerResultados } from "@/lib/metricas/ler";
import { ResultadosMes } from "@/components/metricas/ResultadosMes";

export const dynamic = "force-dynamic";

const Envolvente = ({ children }: { children: React.ReactNode }) => (
  <div>
    <div className="rotulo">o nosso trabalho, em números</div>
    <h1 className="mt-1 font-display text-2xl font-extrabold">Resultados</h1>
    <div className="mt-4">{children}</div>
  </div>
);

export default async function SedeResultados() {
  const ctx = await contextoSede();
  if (!ctx.clienteId) {
    return (
      <Envolvente>
        <p className="rounded-xl border border-line bg-cream px-4 py-3 text-sm text-grey">
          Estamos a preparar os teus números. Assim que houver histórico, aparece aqui o alcance, os
          seguidores ganhos e tudo o que medimos. 🖐️
        </p>
      </Envolvente>
    );
  }

  const dados = await lerResultados(criarClienteServico(), ctx.clienteId);

  if (!dados) {
    return (
      <Envolvente>
        <p className="rounded-xl border border-line bg-cream px-4 py-3 text-sm text-grey">
          Ainda estamos a reunir os números do último mês. Volta em breve — vais ver aqui o alcance,
          as interações e os seguidores ganhos, atualizados todos os dias. 🖐️
        </p>
      </Envolvente>
    );
  }

  return (
    <div className="max-w-3xl">
      <div className="rotulo">o nosso trabalho, em números</div>
      <h1 className="mt-1 font-display text-2xl font-extrabold">Resultados</h1>
      <p className="mt-1 mb-5 text-sm text-grey">
        O que a tua marca alcançou no último mês — medido, não estimado. 🖐️
      </p>
      <ResultadosMes d={dados} />
      <p className="mt-6 text-[11px] text-soft">
        Dados recolhidos do Metricool e atualizados diariamente. TikTok, YouTube e outras redes
        aparecem aqui quando a tua marca as tiver ativas.
      </p>
    </div>
  );
}
