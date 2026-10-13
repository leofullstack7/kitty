export const ROLES = ["ADMIN", "KITTY", "USER"] as const;
export type Role = (typeof ROLES)[number];

export const ORB_COP_VALUE = 10_000;
export const PLATFORM_COMMISSION = 0.28;
export const MAX_BONUS_PERCENT = 25;
export const AUTO_APPROVE_BONUS_BELOW = 15;
export const BONUS_EXPIRY_HOURS = 72;
export const MONTHLY_BONUS_CAP_PCT = 15;
export const SESSION_HOURS = 8;
export const LOGIN_MAX_ATTEMPTS = 5;
export const LOCK_MINUTES = 15;

export const MEET_ORBES = 1;
export const ROOM_ORBES = 2;
export const EXTEND_ORBES = 2;
export const PREVIEW_MINUTES = 5;
export const PREVIEW_SECONDS = PREVIEW_MINUTES * 60;
/** After the five minutes, the widget stays open so he can create the room. */
export const PREVIEW_DECIDE_SECONDS = 10 * 60;
export const PREVIEW_CONNECT_SECONDS = 45;
export const ROOM_MINUTES = 10;
export const EXTEND_MINUTES = 5;
export const TIME_EXTEND_MARK = "TIME_EXTEND_5";

export const ORBE_PACKS = [
  { orbes: 1, label: "1+" },
  { orbes: 5, label: "5+" },
  { orbes: 10, label: "10+" },
  { orbes: 20, label: "20+" },
  { orbes: 50, label: "50+" },
] as const;

export const ACTIVITY_SUGGESTIONS = [
  "Una conversación lenta, sin prisa, como si el mundo se hubiera apagado",
  "Que me cuentes el secreto que no le cuentas a nadie",
  "Una noche de preguntas atrevidas — yo pregunto, tú decides hasta dónde",
  "Playlist + miradas: elige la canción y yo elijo el tema",
  "Roleplay elegante: extraños que se encuentran en un bar violeta",
];

export const COPY = {
  brand: "KITTY",
  slogan: "Ella ya está en línea. Paga por conocerla.",
  hero: "Noches privadas. Voces reales. Orbes que abren puertas.",
};
