import { getHeroesCached, getKittyCardsCached } from "@/lib/catalog";
import { HeroCarousel } from "@/components/hero-carousel";
import { KittyCard } from "@/components/kitty-card";
import Link from "next/link";

export const revalidate = 15;

export default async function HomePage() {
  const [heroes, kittys] = await Promise.all([
    getHeroesCached().catch(() => []),
    getKittyCardsCached().catch(() => []),
  ]);

  return (
    <div className="pb-24">
      <HeroCarousel heroes={heroes} />

      <div className="mt-8 overflow-hidden border-y border-orchid/15 py-3">
        <div className="marquee-track gap-10 text-xs uppercase tracking-[0.35em] text-orchid/80">
          {Array.from({ length: 2 }).map((_, n) => (
            <div key={n} className="flex gap-10 px-6">
              <span>JOIN ahora · no mañana</span>
              <span>1 orbe = $10.000</span>
              <span>AGATTA está viendo quién entra</span>
              <span>Videollamada privada · 1:1</span>
              <span>Bonos solo con ella</span>
              <span>La casa cobra su margen. Tú cobras la noche.</span>
            </div>
          ))}
        </div>
      </div>

      <section className="mx-auto mt-14 max-w-7xl px-4">
        <div className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-end">
          <div>
            <p className="text-xs uppercase tracking-[0.4em] text-magenta">El salón</p>
            <h2 className="font-serif text-4xl md:text-5xl">Ellas no están en un catálogo. Están despiertas.</h2>
            <p className="mt-3 max-w-xl text-orchid/75">
              Elige la cara que no puedes dejar de mirar. Ofrece una actividad. Ponle precio en orbes. Si acepta,
              la habitación se abre. Si ignora, no insistimos: el deseo no se mendiga.
            </p>
          </div>
          <Link href="/explore" prefetch className="glow-btn px-6 py-3 text-sm">
            Ver todas en vivo
          </Link>
        </div>
        <div className="mt-10 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
          {kittys.map((k) => (
            <KittyCard
              key={k.id}
              kitty={{
                slug: k.slug,
                displayName: k.displayName,
                tagline: k.tagline,
                avatarPath: k.avatarPath,
                isAvailable: k.isAvailable,
                busy: k.busy,
                featured: k.featured,
                city: k.city,
              }}
            />
          ))}
        </div>
      </section>

      <section className="mx-auto mt-20 grid max-w-7xl gap-6 px-4 md:grid-cols-3">
        {[
          {
            t: "1. Encuéntrala",
            d: "Cards cuadradas, foto real, pulso verde si está disponible. Esto es una red social de presencia, no un directorio muerto.",
          },
          {
            t: "2. Ofrece el JOIN",
            d: "Tú propones la actividad y los orbes. Ella ve la solicitud en su bandeja. Acepta o ignora. El poder está equilibrado a propósito.",
          },
          {
            t: "3. Entra a la habitación",
            d: "Videollamada con cámara. En PC, chat tipo streaming a la derecha. En celular, formato transmisión. Los orbes suben como reacciones.",
          },
        ].map((x) => (
          <article key={x.t} className="glass hover-lift rounded-3xl p-6">
            <h3 className="font-serif text-3xl">{x.t}</h3>
            <p className="mt-3 text-sm leading-relaxed text-orchid/80">{x.d}</p>
          </article>
        ))}
      </section>

      <section className="mx-auto mt-20 max-w-7xl overflow-hidden rounded-[2rem] px-4">
        <div className="relative overflow-hidden rounded-[2rem]">
          <picture>
            <source media="(max-width: 768px)" srcSet="/media/processed/heroes/orbes-m.webp" />
            <img src="/media/processed/heroes/orbes-d.webp" alt="Orbes" className="h-80 w-full object-cover md:h-96" loading="lazy" />
          </picture>
          <div className="absolute inset-0 bg-void/70" />
          <div className="absolute inset-0 flex flex-col items-start justify-center p-8 md:p-14">
            <p className="text-xs uppercase tracking-[0.4em] text-magenta">economía de la casa</p>
            <h2 className="font-serif text-4xl md:text-5xl">Los orbes no son likes. Son acceso.</h2>
            <p className="mt-3 max-w-lg text-orchid/80">
              1 orbe = $10.000 COP. Si le propones 20 a AGATTA, estás poniendo $200.000 sobre la mesa. Ella lo siente.
              Tú también.
            </p>
            <Link href="/register" prefetch className="glow-btn mt-6 px-6 py-3">
              Crear cuenta y cargar orbes
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
