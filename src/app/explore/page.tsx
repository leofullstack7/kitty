import { getKittyCardsCached } from "@/lib/catalog";
import { KittyCard } from "@/components/kitty-card";

export const revalidate = 10;

export default async function ExplorePage() {
  const kittys = await getKittyCardsCached().catch(() => []);
  const live = kittys.filter((k) => k.isAvailable).length;

  return (
    <div className="mx-auto max-w-7xl px-4 pb-24 pt-6">
      <p className="text-xs uppercase tracking-[0.4em] text-magenta">{live} en línea ahora</p>
      <h1 className="font-serif text-5xl">El salón no duerme</h1>
      <p className="mt-3 max-w-2xl text-orchid/75">
        Toca una card. Mira su perfil. Ofrece el JOIN con orbes. Si está en verde, la noche todavía puede ser tuya.
      </p>
      <div className="mt-10 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
        {kittys.map((k) => (
          <KittyCard
            key={k.id}
            kitty={{
              slug: k.slug,
              displayName: k.displayName,
              tagline: k.tagline,
              avatarPath: k.avatarPath,
              isAvailable: k.isAvailable,
              featured: k.featured,
              city: k.city,
            }}
          />
        ))}
      </div>
    </div>
  );
}
