import { db } from "./db";

export type KittyCardRow = {
  id: string;
  slug: string;
  tagline: string;
  city: string;
  isAvailable: boolean;
  featured: boolean;
  avatarPath: string;
  displayName: string;
};

type Entry<T> = { at: number; value: T };
const mem = new Map<string, Entry<unknown>>();
const TTL = 15_000;

async function cached<T>(key: string, ttl: number, fn: () => Promise<T>): Promise<T> {
  const hit = mem.get(key) as Entry<T> | undefined;
  if (hit && Date.now() - hit.at < ttl) return hit.value;
  const value = await fn();
  mem.set(key, { at: Date.now(), value });
  return value;
}

export function bustCatalog() {
  mem.clear();
}

export function getHeroesCached() {
  return cached("heroes", TTL, () =>
    db.heroBanner.findMany({
      where: { active: true },
      orderBy: { sortOrder: "asc" },
      select: {
        id: true,
        title: true,
        subtitle: true,
        ctaLabel: true,
        ctaHref: true,
        imageDesktop: true,
        imageMobile: true,
      },
    }),
  );
}

export function getKittyCardsCached() {
  return cached("kitty-cards", TTL, async (): Promise<KittyCardRow[]> => {
    const rows = await db.kittyProfile.findMany({
      select: {
        id: true,
        slug: true,
        tagline: true,
        city: true,
        isAvailable: true,
        featured: true,
        avatarPath: true,
        user: { select: { displayName: true } },
      },
      orderBy: [{ featured: "desc" }, { isAvailable: "desc" }],
    });
    return rows.map((k) => ({
      id: k.id,
      slug: k.slug,
      tagline: k.tagline,
      city: k.city,
      isAvailable: k.isAvailable,
      featured: k.featured,
      avatarPath: k.avatarPath,
      displayName: k.user.displayName,
    }));
  });
}

export function getKittyBySlugCached(slug: string) {
  return cached(`kitty:${slug}`, TTL, () =>
    db.kittyProfile.findUnique({
      where: { slug },
      select: {
        id: true,
        slug: true,
        tagline: true,
        bio: true,
        city: true,
        ageLabel: true,
        tags: true,
        isAvailable: true,
        featured: true,
        avatarPath: true,
        coverPath: true,
        user: { select: { displayName: true } },
        media: {
          orderBy: { createdAt: "desc" },
          take: 12,
          select: {
            id: true,
            type: true,
            webPath: true,
            mobilePath: true,
            desktopPath: true,
            posterPath: true,
          },
        },
      },
    }),
  );
}
