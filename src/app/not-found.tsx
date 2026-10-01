import Link from "next/link";

export default function NotFound() {
  return (
    <div className="grid min-h-[60vh] place-items-center px-4 text-center">
      <div>
        <p className="text-xs uppercase tracking-[0.4em] text-magenta">404</p>
        <h1 className="font-serif text-5xl">Esa habitación no existe</h1>
        <Link href="/" className="glow-btn mt-6 inline-block px-6 py-3">
          Volver al salón
        </Link>
      </div>
    </div>
  );
}
