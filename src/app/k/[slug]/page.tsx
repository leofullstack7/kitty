import { notFound } from "next/navigation";
import { KittyProfileClient } from "@/components/kitty-profile-client";
import { getKittyBySlugCached, getKittyCardsCached } from "@/lib/catalog";

export const revalidate = 15;

export async function generateStaticParams() {
  try {
    const kittys = await getKittyCardsCached();
    return kittys.map((k) => ({ slug: k.slug }));
  } catch {
    return [];
  }
}

export default async function KittyPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const kitty = await getKittyBySlugCached(slug);
  if (!kitty) notFound();

  return (
    <KittyProfileClient
      kitty={{
        id: kitty.id,
        slug: kitty.slug,
        displayName: kitty.user.displayName,
        tagline: kitty.tagline,
        bio: kitty.bio,
        city: kitty.city,
        ageLabel: kitty.ageLabel,
        tags: JSON.parse(kitty.tags) as string[],
        isAvailable: kitty.isAvailable && !kitty.busyRoomId,
        busy: !!kitty.busyRoomId,
        featured: kitty.featured,
        avatarPath: kitty.avatarPath,
        coverPath: kitty.coverPath,
        media: kitty.media,
      }}
    />
  );
}
