import type { NextRequest } from "next/server";
import { ORB_COP_VALUE } from "./constants";

export type PayKind = "card" | "wallet" | "bank" | "cash" | "redirect";

export type PayMethod = {
  id: string;
  name: string;
  hint: string;
  kind: PayKind;
  local: boolean;
};

export type CountryPay = {
  code: string;
  name: string;
  currency: string;
  symbol: string;
  /** Precio de 1 orbe en moneda local (1 orbe = 10.000 COP). */
  fxPerOrb: number;
  methods: string[];
};

export const PAY_METHODS: Record<string, PayMethod> = {
  card: { id: "card", name: "Tarjeta", hint: "Visa, Mastercard, Amex · 3-D Secure", kind: "card", local: false },
  paypal: { id: "paypal", name: "PayPal", hint: "Saldo o tarjeta, en todo el mundo", kind: "redirect", local: false },
  applepay: { id: "applepay", name: "Apple Pay", hint: "Un toque en iPhone o Mac", kind: "redirect", local: false },
  googlepay: { id: "googlepay", name: "Google Pay", hint: "Un toque en Android o Chrome", kind: "redirect", local: false },
  nequi: { id: "nequi", name: "Nequi", hint: "Push a tu celular en segundos", kind: "wallet", local: true },
  daviplata: { id: "daviplata", name: "Daviplata", hint: "Saldo digital Davivienda", kind: "wallet", local: true },
  pse: { id: "pse", name: "PSE", hint: "Débito desde tu banco en Colombia", kind: "bank", local: true },
  bancolombia: { id: "bancolombia", name: "Bancolombia", hint: "App o sucursal virtual", kind: "bank", local: true },
  oxxo: { id: "oxxo", name: "OXXO", hint: "Paga en efectivo en la tienda", kind: "cash", local: true },
  spei: { id: "spei", name: "SPEI", hint: "Transferencia bancaria México", kind: "bank", local: true },
  mercadopago: { id: "mercadopago", name: "Mercado Pago", hint: "Saldo, tarjeta o efectivo", kind: "redirect", local: true },
  yape: { id: "yape", name: "Yape", hint: "Paga con tu número en Perú", kind: "wallet", local: true },
  plin: { id: "plin", name: "Plin", hint: "Transferencia instantánea Perú", kind: "wallet", local: true },
  webpay: { id: "webpay", name: "Webpay", hint: "Redcompra y tarjetas Chile", kind: "card", local: true },
  mach: { id: "mach", name: "MACH", hint: "Billetera Banco Bci", kind: "wallet", local: true },
  pix: { id: "pix", name: "PIX", hint: "Clave o QR en segundos", kind: "bank", local: true },
  boleto: { id: "boleto", name: "Boleto", hint: "Paga en bancos o lotéricas", kind: "cash", local: true },
  sepa: { id: "sepa", name: "SEPA", hint: "Débito desde tu cuenta europea", kind: "bank", local: true },
  bizum: { id: "bizum", name: "Bizum", hint: "Paga con tu móvil en España", kind: "wallet", local: true },
};

const WORLD = ["card", "paypal", "applepay", "googlepay"];
const LATAM = ["card", "paypal", "mercadopago", "applepay", "googlepay"];

export const COUNTRIES: Record<string, CountryPay> = {
  CO: { code: "CO", name: "Colombia", currency: "COP", symbol: "$", fxPerOrb: ORB_COP_VALUE, methods: ["nequi", "daviplata", "pse", "bancolombia", "card", "paypal"] },
  MX: { code: "MX", name: "México", currency: "MXN", symbol: "$", fxPerOrb: 45, methods: ["oxxo", "spei", "mercadopago", "card", "paypal"] },
  AR: { code: "AR", name: "Argentina", currency: "ARS", symbol: "$", fxPerOrb: 3500, methods: ["mercadopago", "card", "paypal"] },
  CL: { code: "CL", name: "Chile", currency: "CLP", symbol: "$", fxPerOrb: 2300, methods: ["webpay", "mach", "card", "paypal"] },
  PE: { code: "PE", name: "Perú", currency: "PEN", symbol: "S/", fxPerOrb: 9, methods: ["yape", "plin", "card", "paypal"] },
  BR: { code: "BR", name: "Brasil", currency: "BRL", symbol: "R$", fxPerOrb: 14, methods: ["pix", "boleto", "mercadopago", "card", "paypal"] },
  EC: { code: "EC", name: "Ecuador", currency: "USD", symbol: "$", fxPerOrb: 2.5, methods: LATAM },
  PA: { code: "PA", name: "Panamá", currency: "USD", symbol: "$", fxPerOrb: 2.5, methods: LATAM },
  CR: { code: "CR", name: "Costa Rica", currency: "CRC", symbol: "₡", fxPerOrb: 1300, methods: LATAM },
  DO: { code: "DO", name: "República Dominicana", currency: "DOP", symbol: "RD$", fxPerOrb: 150, methods: LATAM },
  UY: { code: "UY", name: "Uruguay", currency: "UYU", symbol: "$", fxPerOrb: 100, methods: LATAM },
  US: { code: "US", name: "Estados Unidos", currency: "USD", symbol: "$", fxPerOrb: 2.5, methods: WORLD },
  CA: { code: "CA", name: "Canadá", currency: "CAD", symbol: "$", fxPerOrb: 3.4, methods: WORLD },
  ES: { code: "ES", name: "España", currency: "EUR", symbol: "€", fxPerOrb: 2.3, methods: ["bizum", "sepa", "card", "paypal", "applepay", "googlepay"] },
  GB: { code: "GB", name: "Reino Unido", currency: "GBP", symbol: "£", fxPerOrb: 2, methods: WORLD },
  FR: { code: "FR", name: "Francia", currency: "EUR", symbol: "€", fxPerOrb: 2.3, methods: ["sepa", ...WORLD] },
  DE: { code: "DE", name: "Alemania", currency: "EUR", symbol: "€", fxPerOrb: 2.3, methods: ["sepa", ...WORLD] },
  IT: { code: "IT", name: "Italia", currency: "EUR", symbol: "€", fxPerOrb: 2.3, methods: ["sepa", ...WORLD] },
  PT: { code: "PT", name: "Portugal", currency: "EUR", symbol: "€", fxPerOrb: 2.3, methods: ["sepa", ...WORLD] },
  NL: { code: "NL", name: "Países Bajos", currency: "EUR", symbol: "€", fxPerOrb: 2.3, methods: ["sepa", ...WORLD] },
};

export const COUNTRY_LIST = Object.values(COUNTRIES).sort((a, b) => a.name.localeCompare(b.name, "es"));

export const WORLD_FALLBACK: CountryPay = {
  code: "XX",
  name: "Internacional",
  currency: "USD",
  symbol: "$",
  fxPerOrb: 2.5,
  methods: WORLD,
};

export const RECHARGE_PACKS = [10, 20, 50, 100, 250] as const;
export const METHOD_IDS = Object.keys(PAY_METHODS);

export function countryOf(code?: string | null): CountryPay {
  const key = (code ?? "").toUpperCase();
  return COUNTRIES[key] ?? WORLD_FALLBACK;
}

export function methodsFor(code?: string | null): PayMethod[] {
  const country = countryOf(code);
  const seen = new Set<string>();
  return country.methods
    .map((id) => PAY_METHODS[id])
    .filter((m): m is PayMethod => {
      if (!m || seen.has(m.id)) return false;
      seen.add(m.id);
      return true;
    });
}

export function isMethodAllowed(code: string | null | undefined, method: string) {
  return methodsFor(code).some((m) => m.id === method);
}

export function formatMoney(amount: number, country: CountryPay) {
  try {
    return new Intl.NumberFormat("es", {
      style: "currency",
      currency: country.currency === "XX" ? "USD" : country.currency,
      maximumFractionDigits: country.currency === "COP" || country.currency === "CLP" || country.currency === "ARS" ? 0 : 2,
    }).format(amount);
  } catch {
    return `${country.symbol}${amount.toLocaleString("es-CO")}`;
  }
}

export function priceFor(orbes: number, country: CountryPay) {
  const local = orbes * country.fxPerOrb;
  const cop = orbes * ORB_COP_VALUE;
  return {
    orbes,
    cop,
    local,
    label: formatMoney(local, country),
    copLabel: `$${cop.toLocaleString("es-CO")} COP`,
  };
}

export function detectCountry(req: NextRequest, fallback?: string | null) {
  const forced = req.nextUrl.searchParams.get("country") ?? fallback;
  if (forced && (COUNTRIES[forced.toUpperCase()] || forced.toUpperCase() === "XX")) {
    return countryOf(forced);
  }
  const headers = [
    req.headers.get("x-vercel-ip-country"),
    req.headers.get("cf-ipcountry"),
    req.headers.get("x-country-code"),
  ];
  for (const raw of headers) {
    if (raw && raw !== "XX" && raw !== "T1") return countryOf(raw);
  }
  const lang = req.headers.get("accept-language") ?? "";
  const loc = lang.split(",")[0] ?? "";
  const region = loc.split("-")[1];
  if (region) return countryOf(region);
  return WORLD_FALLBACK;
}

export function checkoutPayload(country: CountryPay) {
  return {
    country: country.code,
    countryName: country.name,
    currency: country.currency,
    methods: methodsFor(country.code),
    packs: RECHARGE_PACKS.map((orbes) => priceFor(orbes, country)),
    orbCop: ORB_COP_VALUE,
  };
}
