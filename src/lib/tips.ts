import { db } from "./db";

const DEFAULTS = [
  { title: "Una canción y una mirada", orbes: 5 },
  { title: "Pregunta atrevida, yo decido hasta dónde", orbes: 10 },
  { title: "Quédate más cerca un rato", orbes: 20 },
];

export async function listTips(kittyId: string, onlyActive = true) {
  const existing = await db.kittyTip.findMany({
    where: { kittyId, ...(onlyActive ? { active: true } : {}) },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: { id: true, title: true, orbes: true, active: true, sortOrder: true },
  });
  if (existing.length > 0) return existing;
  await db.kittyTip.createMany({
    data: DEFAULTS.map((t, i) => ({ kittyId, title: t.title, orbes: t.orbes, sortOrder: i })),
  });
  return db.kittyTip.findMany({
    where: { kittyId, ...(onlyActive ? { active: true } : {}) },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: { id: true, title: true, orbes: true, active: true, sortOrder: true },
  });
}
