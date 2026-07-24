/**
 * O que falta e qual é o próximo passo — calculado em código, não adivinhado.
 * A IA depois usa isto para dizer COMO abordar. Aqui garantimos O QUÊ, sempre igual.
 */

import type { Estado } from "./funil";

export type Lacuna = { campo: string; porque: string; critico: boolean };

export type ContextoGuia = {
  estado: Estado;
  temWebsite: boolean;
  temContacto: boolean;
  temTelefoneOuEmail: boolean;
  temSetor: boolean;
  temValorEstimado: boolean;
  temDiagnostico: boolean;
  diagnosticoConcluido: boolean;
  temObjetivos: boolean;
  temAnaliseSite: boolean;
  redesAvaliadas: number;
  temProposta: boolean;
  propostaEnviada: boolean;
  nAtividades: number;
  followupAtrasado: boolean;
  diasSemInteracao: number | null;
};

/** Informação em falta que trava o trabalho. */
export function lacunas(c: ContextoGuia): Lacuna[] {
  const L: Lacuna[] = [];

  if (!c.temContacto)
    L.push({
      campo: "Pessoa de contacto",
      porque: "Sem saber com quem falas, não há conversa nem seguimento.",
      critico: true,
    });
  if (!c.temTelefoneOuEmail)
    L.push({
      campo: "Telefone ou email",
      porque: "É por onde vais marcar o diagnóstico.",
      critico: true,
    });
  if (!c.temSetor)
    L.push({
      campo: "Setor",
      porque: "Sem o setor, a proposta sai genérica — e genérica não fecha.",
      critico: false,
    });
  if (!c.temWebsite)
    L.push({
      campo: "Website",
      porque: "Sem endereço não há análise automática. Se não tiver site, isso é já uma oportunidade.",
      critico: false,
    });

  if (c.temDiagnostico) {
    if (!c.temAnaliseSite && c.temWebsite)
      L.push({
        campo: "Análise do site no diagnóstico",
        porque: "É a prova concreta que abre a conversa. Corre a análise.",
        critico: true,
      });
    if (c.redesAvaliadas === 0)
      L.push({
        campo: "Scorecard das redes",
        porque: "Sem avaliar as redes, metade do retrato fica por fazer.",
        critico: true,
      });
    if (!c.temObjetivos)
      L.push({
        campo: "Objetivos do cliente",
        porque:
          "Isto é o que separa um relatório técnico de uma proposta. Sem saber o que ele quer, só falas de lacunas.",
        critico: true,
      });
  }

  if (!c.temValorEstimado && ["diagnostico", "proposta"].includes(c.estado))
    L.push({
      campo: "Valor estimado do negócio",
      porque: "Sem ele, o pipeline não te diz nada.",
      critico: false,
    });

  return L;
}

/** A única coisa a fazer a seguir. */
export function proximoPasso(c: ContextoGuia): { acao: string; porque: string } {
  if (c.followupAtrasado)
    return {
      acao: "Cumprir o follow-up que está atrasado",
      porque: "Prometeste voltar e não voltaste. É o que mais custa credibilidade.",
    };

  switch (c.estado) {
    case "lead":
      return c.nAtividades === 0
        ? {
            acao: "Fazer a primeira abordagem",
            porque: "Abre com um achado concreto sobre o negócio dele, não com uma apresentação.",
          }
        : {
            acao: "Marcar o diagnóstico gratuito de 20 minutos",
            porque: "Já houve contacto — agora é transformá-lo em conversa a sério.",
          };

    case "contactado":
      return !c.temDiagnostico
        ? {
            acao: "Fazer o Raio-X e marcar a apresentação",
            porque: "Chegar com o diagnóstico feito muda a conversa: deixas de vender, passas a mostrar.",
          }
        : {
            acao: "Concluir o diagnóstico e apresentá-lo",
            porque: "Está começado. Fecha-o e marca a conversa para o mostrar.",
          };

    case "diagnostico":
      if (!c.diagnosticoConcluido)
        return {
          acao: "Terminar o diagnóstico",
          porque: "Faltam peças. Sem elas, a proposta sai fraca.",
        };
      return c.temProposta
        ? { acao: "Enviar a proposta", porque: "Está feita. Envia e marca a conversa para a apresentar." }
        : {
            acao: "Criar a proposta a partir do diagnóstico",
            porque: "O diagnóstico está pronto — a proposta herda tudo e sai em minutos.",
          };

    case "proposta":
      return c.propostaEnviada
        ? {
            acao: "Seguir a proposta enviada",
            porque:
              c.diasSemInteracao && c.diasSemInteracao > 5
                ? `Já vão ${c.diasSemInteracao} dias sem falarem. Liga — email não fecha negócio.`
                : "Combina uma data para a decisão, sem pressionar.",
          }
        : { acao: "Enviar a proposta ao cliente", porque: "Está em rascunho. Cria o link e envia." };

    case "cliente":
      return {
        acao: "Cuidar de quem já cá está",
        porque: "Um cliente satisfeito é a melhor porta para o próximo. Pede uma referência.",
      };

    case "perdido":
      return {
        acao: "Guardar para daqui a uns meses",
        porque: "Perdido hoje não é perdido para sempre. Regista o motivo e volta mais tarde.",
      };
  }
}
