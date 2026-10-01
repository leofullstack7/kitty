"use client";

export function OrbField() {
  const orbs = [
    { s: 90, t: "8%", l: "6%", d: "0s" },
    { s: 54, t: "18%", l: "78%", d: "1.2s" },
    { s: 34, t: "70%", l: "12%", d: "0.6s" },
    { s: 70, t: "62%", l: "82%", d: "2s" },
    { s: 22, t: "40%", l: "48%", d: "1.6s" },
    { s: 120, t: "-6%", l: "40%", d: "0.3s" },
  ];
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {orbs.map((o, i) => (
        <span
          key={i}
          className="orb"
          style={{
            width: o.s,
            height: o.s,
            top: o.t,
            left: o.l,
            animationDelay: o.d,
            opacity: 0.55,
          }}
        />
      ))}
    </div>
  );
}
