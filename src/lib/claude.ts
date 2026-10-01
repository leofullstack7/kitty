import Anthropic from "@anthropic-ai/sdk";
import { env } from "./env";
import { localModerate } from "./moderation";

export async function moderateText(text: string, context: "chat" | "activity" | "bio") {
  const local = localModerate(text);
  if (!local.allowed) return local;

  if (context === "chat" || !env.ANTHROPIC_API_KEY) {
    return local;
  }

  try {
    const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
    const res = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 120,
      system:
        "Filtro de KITTY, videollamadas privadas entre adultos. PERMITE coqueteo, deseo y lenguaje adulto consensuado. SOLO rechaza: menores de 18, no consentimiento, delitos reales, odio. No rechaces por ser erótico o vulgar entre adultos. Responde SOLO JSON {allowed:boolean, reason:string}.",
      messages: [{ role: "user", content: `Contexto:${context}\nTexto:${local.rewritten}` }],
    });
    const raw = res.content[0]?.type === "text" ? res.content[0].text : "{}";
    const parsed = JSON.parse(raw.replace(/```json|```/g, "").trim()) as { allowed?: boolean; reason?: string };
    if (parsed.allowed === false) {
      return { allowed: false, reason: parsed.reason ?? "Esa línea no entra a la casa.", rewritten: local.rewritten };
    }
    return local;
  } catch {
    return local;
  }
}

export async function icebreakersFor(kittyName: string, tags: string[]) {
  if (!env.ANTHROPIC_API_KEY) {
    return [
      `Hola ${kittyName}... si tu noche tuviera un color, ¿cuál sería?`,
      "Tengo orbes y una pregunta que no me atrevo a escribir aquí.",
      "Elige: confesión, juego o silencio cómplice.",
    ];
  }
  try {
    const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
    const res = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 300,
      messages: [
        {
          role: "user",
          content: `Genera 3 icebreakers cortos y elegantes en español para invitar a ${kittyName} (${tags.join(", ")}) a una videollamada privada entre adultos. JSON array de strings. Pueden ser atrevidos. Nunca menores.`,
        },
      ],
    });
    const raw = res.content[0]?.type === "text" ? res.content[0].text : "[]";
    const parsed = JSON.parse(raw.replace(/```json|```/g, "").trim());
    if (Array.isArray(parsed)) return parsed.slice(0, 3).map(String);
  } catch {
    /* local fallback */
  }
  return [
    `${kittyName}, si aceptas mi JOIN, prometo no desperdiciar tu tiempo.`,
    "Quiero una conversación que no se pueda screenshotear.",
    "20 orbes. Un tema. Tú pones las reglas.",
  ];
}
