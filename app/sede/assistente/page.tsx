import { contextoSede } from "@/lib/sede/contexto";
import { AssistenteSede } from "@/components/sede/AssistenteSede";

export const dynamic = "force-dynamic";

export default async function SedeAssistentePage() {
  const ctx = await contextoSede();
  return (
    <div className="max-w-3xl">
      <div className="rotulo">o teu assistente de IA</div>
      <h1 className="mt-1 font-display text-2xl font-extrabold">Pergunta-me o que quiseres 🖐️</h1>
      <p className="mt-1 text-sm text-grey">
        Conheço o teu negócio, o teu plano e os teus números — explico o trabalho, dou ideias e
        respondo a qualquer hora. As decisões e a execução são sempre da tua equipa e do Nº 5.
      </p>
      <AssistenteSede marca={ctx.marca.nome} />
    </div>
  );
}
