import Anthropic from "@anthropic-ai/sdk";
import { env } from "./env";
import { sanitizeText } from "./security";

const BLOCKLIST = [
  "menor", "niña", "niño", "nazi", "drogas", "coca", "arma", "asesin", "suicidio",
];

export async function moderateText(text: string, context: "chat" | "activity" | "bio") {
  const clean = sanitizeText(text, 1500);
  const lowered = clean.toLowerCase();
  if (BLOCKLIST.some((w) => lowered.includes(w))) {
    return { allowed: false, reason: "Contenido no permitido", rewritten: clean };
  }
  if (!env.ANTHROPIC_API_KEY) {
    return { allowed: true, reason: "local", rewritten: clean };
  }
  try {
    const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
    const res = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 200,
      system:
        "Eres el filtro de integridad de KITTY, una plataforma de videollamadas privadas entre adultos. Rechaza menores, violencia, odio, delitos y datos personales sensibles. Responde SOLO JSON {allowed:boolean, reason:string}.",
      messages: [{ role: "user", content: `Contexto:${context}\nTexto:${clean}` }],
    });
    const raw = res.content[0]?.type === "text" ? res.content[0].text : "{}";
    const parsed = JSON.parse(raw.replace(/```json|```/g, "").trim()) as { allowed?: boolean; reason?: string };
    return { allowed: parsed.allowed !== false, reason: parsed.reason ?? "ok", rewritten: clean };
  } catch {
    return { allowed: true, reason: "fallback", rewritten: clean };
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
          content: `Genera 3 icebreakers cortos, elegantes y femeninos en español para invitar a ${kittyName} (${tags.join(", ")}) a una videollamada privada. JSON array de strings. Adultos, no explícito.`,
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
