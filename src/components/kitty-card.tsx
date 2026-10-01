import Link from "next/link";

export type KittyCardData = {
  slug: string;
  displayName: string;
  tagline: string;
  avatarPath: string;
  isAvailable: boolean;
  busy?: boolean;
  featured?: boolean;
  city: string;
};

export function KittyCard({ kitty }: { kitty: KittyCardData }) {
  return (
    <Link href={`/k/${kitty.slug}`} prefetch className="group block">
      <article className="kitty-card">
        <picture>
          <source media="(max-width: 768px)" srcSet={kitty.avatarPath.replace("card.webp", "mobile.webp")} />
          <img
            src={kitty.avatarPath}
            alt={kitty.displayName}
            className="transition duration-700 group-hover:scale-110"
            loading="lazy"
            decoding="async"
          />
        </picture>
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-transparent" />
        {kitty.busy ? (
          <span className="absolute left-3 top-3 flex items-center gap-2 rounded-full bg-black/50 px-3 py-1 text-[11px] uppercase tracking-widest">
            <span className="busy-dot" /> Ocupada
          </span>
        ) : kitty.isAvailable ? (
          <span className="absolute left-3 top-3 flex items-center gap-2 rounded-full bg-black/50 px-3 py-1 text-[11px] uppercase tracking-widest">
            <span className="available-dot" /> En línea
          </span>
        ) : null}
        {kitty.featured && (
          <span className="absolute right-3 top-3 rounded-full bg-magenta px-3 py-1 text-[10px] font-semibold uppercase tracking-widest">
            Ícono
          </span>
        )}
        <div className="absolute inset-x-0 bottom-0 p-4">
          <h3 className="font-serif text-3xl">{kitty.displayName}</h3>
          <p className="line-clamp-2 text-xs text-orchid/90">{kitty.tagline}</p>
          <p className="mt-2 text-[10px] uppercase tracking-[0.25em] text-white/60">{kitty.city}</p>
        </div>
      </article>
    </Link>
  );
}
