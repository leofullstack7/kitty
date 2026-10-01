"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Hero = {
  id: string;
  title: string;
  subtitle: string;
  ctaLabel: string;
  ctaHref: string;
  imageDesktop: string;
  imageMobile: string;
};

export function HeroCarousel({ heroes }: { heroes: Hero[] }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((v) => (v + 1) % Math.max(heroes.length, 1)), 6500);
    return () => clearInterval(t);
  }, [heroes.length]);
  if (!heroes.length) return null;
  const h = heroes[i]!;
  return (
    <section className="relative mx-auto mt-2 max-w-7xl overflow-hidden rounded-[2rem] px-4">
      <div className="relative h-[72vw] max-h-[620px] min-h-[420px] overflow-hidden rounded-[2rem]">
        <picture>
          <source media="(max-width: 768px)" srcSet={h.imageMobile} />
          <img src={h.imageDesktop} alt={h.title} className="hero-kenburns absolute inset-0 h-full w-full object-cover" />
        </picture>
        <div className="absolute inset-0 bg-gradient-to-t from-void via-void/40 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-r from-void/80 via-transparent to-transparent" />
        <div className="relative z-10 flex h-full max-w-2xl flex-col justify-end p-6 md:p-12">
          <p className="text-xs uppercase tracking-[0.4em] text-orchid">KITTY live</p>
          <h1 className="font-serif text-4xl leading-tight md:text-6xl">{h.title}</h1>
          <p className="mt-3 max-w-lg text-sm text-orchid/85 md:text-base">{h.subtitle}</p>
          <Link href={h.ctaHref} className="glow-btn mt-6 inline-flex w-fit px-7 py-3">
            {h.ctaLabel}
          </Link>
        </div>
        <div className="absolute bottom-5 right-5 z-10 flex gap-2">
          {heroes.map((_, idx) => (
            <button
              key={idx}
              aria-label={`Slide ${idx + 1}`}
              onClick={() => setI(idx)}
              className={`h-2 rounded-full transition-all ${idx === i ? "w-8 bg-magenta" : "w-2 bg-white/40"}`}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
