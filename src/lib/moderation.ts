import { sanitizeText } from "./security";

/**
 * KITTY es una casa de adultos. El filtro solo corta lo que rompe la casa:
 * menores, odio, delito real y datos que doxean. El deseo entre adultos pasa.
 */
const HARD = [
  /\bmenor(?:es)?\s+de\s*(?:edad|1[0-7]\b|18\b)/i,
  /\b(?:soy|eres|es|somos|tengo)\s+menor(?:es)?\b/i,
  /\bniñ[oa]s?\b/i,
  /\bped[oó]fil/i,
  /\bpornograf[ií]a\s+infantil\b/i,
  /\bnazi\b/i,
  /\bsuicid/i,
  /\basesin/i,
];

export function redactPii(text: string) {
  return text
    .replace(/\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g, "[correo]")
    .replace(/(?:\+?\d[\s().-]*){10,}/g, "[dato]");
}

export function localModerate(text: string) {
  const clean = sanitizeText(text, 1500);
  if (HARD.some((re) => re.test(clean))) {
    return { allowed: false as const, reason: "Esa línea no entra a la casa.", rewritten: clean };
  }
  return { allowed: true as const, reason: "ok", rewritten: redactPii(clean) };
}
