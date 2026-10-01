import {
  AUTO_APPROVE_BONUS_BELOW,
  BONUS_EXPIRY_HOURS,
  MAX_BONUS_PERCENT,
  MONTHLY_BONUS_CAP_PCT,
  PLATFORM_COMMISSION,
} from "./constants";

export type Split = {
  original: number;
  percent: number;
  userPays: number;
  platformFee: number;
  kittyNet: number;
  valid: boolean;
  reason?: string;
};

/**
 * Margen Blindado: la comisión de KITTY se calcula sobre el precio ORIGINAL.
 * El descuento lo absorbe la Kitty con su parte neta. La plataforma nunca pierde margen.
 */
export function splitOrbes(orbes: number, bonusPercent = 0): Split {
  if (!Number.isInteger(orbes) || orbes < 1 || orbes > 500) {
    return { original: orbes, percent: bonusPercent, userPays: 0, platformFee: 0, kittyNet: 0, valid: false, reason: "Cantidad de orbes inválida" };
  }
  const percent = Math.max(0, Math.min(bonusPercent, MAX_BONUS_PERCENT));
  const userPays = Math.max(1, Math.round(orbes * (1 - percent / 100)));
  const platformFee = Math.max(1, Math.round(orbes * PLATFORM_COMMISSION));
  const kittyNet = userPays - platformFee;
  if (kittyNet < 1) {
    return {
      original: orbes,
      percent,
      userPays,
      platformFee,
      kittyNet: 0,
      valid: false,
      reason: "El bono dejaría a la Kitty sin ingreso. Baja el porcentaje o sube los orbes.",
    };
  }
  return { original: orbes, percent, userPays, platformFee, kittyNet, valid: true };
}

export function bonusNeedsApproval(percent: number) {
  return percent > AUTO_APPROVE_BONUS_BELOW;
}

export function bonusExpiresAt(from = new Date()) {
  return new Date(from.getTime() + BONUS_EXPIRY_HOURS * 3600_000);
}

export function monthlyCapWouldExceed(usedOrbesDiscount: number, monthlyGrossOrbes: number, extraDiscount: number) {
  const cap = Math.max(1, Math.round(monthlyGrossOrbes * (MONTHLY_BONUS_CAP_PCT / 100)));
  return usedOrbesDiscount + extraDiscount > cap && monthlyGrossOrbes > 0;
}

export function randomCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "KTY-";
  for (let i = 0; i < 8; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}
