/**
 * Ponto único de registo de erros. Hoje escreve uma linha JSON no stderr (vai
 * para os logs da função na Netlify); amanhã liga-se aqui o Sentry/Logtail sem
 * mexer nos chamadores. Nunca atira — registar um erro não pode causar outro.
 */
type Meta = Record<string, unknown>;

export function registarErro(contexto: string, erro: unknown, meta?: Meta): void {
  try {
    const payload = {
      nivel: "erro",
      contexto,
      ts: new Date().toISOString(),
      mensagem: erro instanceof Error ? erro.message : String(erro),
      stack: erro instanceof Error ? erro.stack : undefined,
      ...meta,
    };
    console.error("[n5]", JSON.stringify(payload));
    // TODO(observabilidade): encaminhar para Sentry/Logtail quando houver DSN.
  } catch {
    // registar não pode partir nada
  }
}
