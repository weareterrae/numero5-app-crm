/**
 * ⛔ REGRA DURA DA MARCA Nº 5
 *
 * A contagem (4 traços verticais + o 5.º na diagonal) tem UMA só forma oficial.
 * É PROIBIDO redesenhá-la com CSS, <div>, transform ou aproximações.
 * Este ficheiro é a ÚNICA fonte do símbolo em toda a aplicação.
 *
 * Inviolável: viewBox 210×110 · traços em x=25,75,125,175 (y 8→102) ·
 * diagonal SEMPRE "M4 88 L200 20" dourada (#E8A13C) · stroke-width 16 · linecap round.
 * Escala-se mudando só a largura; a proporção nunca muda.
 */

type Props = {
  /** "claro" = fundo claro (traços escuros) · "escuro" = fundo escuro (traços creme) */
  fundo?: "claro" | "escuro";
  className?: string;
  /** Texto alternativo. Se omitido, o símbolo é decorativo. */
  titulo?: string;
};

export function Simbolo({ fundo = "claro", className, titulo }: Props) {
  const tracos = fundo === "escuro" ? "#F5F4F0" : "#15181D";
  return (
    <svg
      viewBox="0 0 210 110"
      className={className}
      role={titulo ? "img" : "presentation"}
      aria-label={titulo}
      aria-hidden={titulo ? undefined : true}
    >
      {titulo ? <title>{titulo}</title> : null}
      <g strokeWidth={16} strokeLinecap="round" fill="none">
        <path stroke={tracos} d="M25 8 V102 M75 8 V102 M125 8 V102 M175 8 V102" />
        <path stroke="#E8A13C" d="M4 88 L200 20" />
      </g>
    </svg>
  );
}
