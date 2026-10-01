# KITTY — MVP

Plataforma de videollamadas privadas 1:1 entre **Users** y **Kittys**, con economía de **orbes**, bandeja de JOIN, bonos de lealtad y un panel de administración. Interfaz femenina, comercial, animada y pensada primero para celular.

## Cómo arrancar

```bash
npm install
npx prisma generate
npm run db:reset
npm run dev
```

Abre [http://localhost:3000](http://localhost:3000).

### Cuentas de prueba

| Rol | Usuario | Clave |
|---|---|---|
| Admin | `flow` | `mamboneta123` |
| User | `invitado` | `NocheVioleta1!` |
| Kitty AGATTA | `agatta` | `AgattaMoon#26` |
| Kitty Luna | `luna` | `LunaViolet#26` |
| Kitty Violeta | `violeta` | `VioletaFire#26` |
| Kitty Nova | `nova` | `NovaSpark#26` |
| Kitty Mika | `mika` | `MikaPearl#26` |

El admin puede ver y cambiar las credenciales de cualquier Kitty (incluida AGATTA) en `/admin`.

`invitado` nace con **250 orbes** y un bono del 15% solo con Mika (`KTY-MIKA15`).

## Qué incluye este MVP

- 3 roles: `ADMIN`, `KITTY`, `USER` con interfaces distintas.
- Registro / login con usuario y contraseña, cookies httpOnly, bloqueo por intentos.
- Landing comercial con heroes dinámicos (desktop + móvil), grid de Kittys y copy de conversión.
- 5 Kittys ficticias con foto, bio, galería y disponibilidad. **AGATTA** es la ícono de la casa.
- JOIN: el user propone actividad + orbes; la Kitty acepta o ignora en su bandeja.
- Videollamada WebRTC (cámara + mic). PC: video + chat tipo streaming a la derecha. Móvil: formato transmisión, chat overlay, orbes flotando hacia arriba (estilo reacciones).
- Packs en llamada: `1+ 5+ 10+ 20+ 50+`. El pago se anima de forma visual para la Kitty.
- Billetera y checkout **fase 2 (solo interfaz)**: tarjeta, Nequi, Daviplata, PayPal. El sandbox acredita orbes sin cobrar.
- Bonos de descuento que la Kitty regala a un user, **solo canjeables con ella**.
- Admin: CRUD de Kittys, credenciales, heroes on/off, aprobación de bonos, stats.
- Media: fotos a **WebP** (móvil / card / desktop). Videos a MP4 web si hay `ffmpeg` en PATH.
- Moderación de texto con **Claude (Anthropic)** si hay `ANTHROPIC_API_KEY`; si no, filtro local.

## Economía: 1 orbe = $10.000 COP

### Margen Blindado (control comercial de bonos)

La casa **nunca** pierde comisión por un descuento.

1. Comisión de plataforma: **28% sobre el precio ORIGINAL** (no sobre lo que pagó el user).
2. El % de bono lo absorbe la Kitty con su parte neta.
3. Tope de bono: **25%**.
4. Bonos **> 15%** quedan en `PENDING_APPROVAL` hasta que Flow los apruebe.
5. Caducan en **72 horas**, son de **un solo uso** y están amarrados a `kittyId + userId`.
6. Si el descuento dejaría a la Kitty en neto < 1 orbe, el sistema rechaza el bono.

Ejemplo: 20 orbes con 20% off.

- User paga 16.
- Casa cobra `round(20 * 0.28) = 6`.
- Kitty recibe `16 - 6 = 10` (en vez de 14).

Código: `src/lib/bonuses.ts`.

## Stack

- Next.js 15.5.9 (parcheado vs CVE-2025-66478 / RSC) + React 19 + Tailwind 4
- Prisma 6 + SQLite (`prisma/dev.db`)
- Socket.IO (signaling WebRTC + chat + orbe-burst)
- Sharp (imágenes) · ffmpeg opcional (videos)
- Anthropic SDK · jose (JWT) · bcryptjs · zod

Servidor custom: `server.ts` (Next + Socket.IO). Por eso `npm run dev` no usa `next dev` puro.

## Seguridad (capas cubiertas en el MVP)

- Next parcheado, `X-Frame-Options`, nosniff, Referrer-Policy, Permissions-Policy, CSP.
- Passwords con bcrypt (cost 12). JWT en cookie httpOnly / SameSite=lax.
- Rate limit por IP en login, register, checkout y media.
- Lockout a los 5 logins fallidos (15 min).
- Validación zod + sanitize HTML/control chars.
- Magic bytes en uploads (no confiar en la extensión).
- RBAC en middleware y en cada ruta.
- Origin check en mutaciones.
- Audit log de logins.
- Gate +18.
- Moderación Anthropic en actividades/chat (si hay API key).
- Originales de media fuera de `public/` (`uploads/originals`).

Pendiente para producción: Redis rate-limit, TURN server, WAF, 2FA admin, KYC/edad reforzada, secrets en vault, backups cifrados, pasarelas PCI reales.

## Rutas

| Ruta | Quién |
|---|---|
| `/` | Pública, heroes + salón |
| `/explore` `/k/[slug]` | Catálogo y perfil |
| `/login` `/register` | Auth |
| `/inbox` | JOIN del user o de la Kitty |
| `/call/[roomId]` | Videollamada |
| `/wallet` | Orbes + checkout fase 2 |
| `/studio` | Kitty: presencia, bandeja, bonos, media |
| `/admin` | Flow: CRUD total |

## Videollamadas

WebRTC P2P con STUN público de Google. En LAN/mismo NAT suele funcionar. En internet real hay que añadir un **TURN** (coturn / Twilio). Sin TURN, algunos celulares 4G no verán video.

Permisos: el navegador pedirá cámara y micrófono. Hay que servir en localhost o HTTPS.

## Anthropic

En `.env`:

```
ANTHROPIC_API_KEY=sk-ant-...
```

Se usa para moderar propuestas de actividad y (opcional) icebreakers. El modelo configurado es `claude-sonnet-4-20250514` en `src/lib/claude.ts`.

## Pagos (fase 2)

La UI de tarjeta / Nequi / Daviplata / PayPal está en `/wallet`. `POST /api/wallet/checkout` **no cobra**: acredita orbes en sandbox y deja `meta.charged=false`. Siguiente paso: Wompi o PayU (CO) + PayPal Orders + webhooks firmados.

## Qué sigue (backlog para Cursor)

1. TURN + grabación opt-in + indicador de live real.
2. Pasarelas de pago y facturación DIAN / receipts.
3. Cola de media con worker (BullMQ) y antivirus.
4. 2FA para admin, rotación de JWT secret, Redis.
5. Perfil Kitty más rico (reels, destacados, precios mínimos).
6. Analytics de conversión JOIN → accept → orbes extra.
7. Tests e2e (Playwright) del flujo JOIN.
8. App PWA / notificación push cuando aceptan el JOIN.
9. i18n si se abre LATAM fuera de CO.
10. Endurecer CSP (quitar `unsafe-eval` cuando Socket/Next lo permitan).

## Estructura útil

```
src/app            páginas y API
src/components     UI (cards, heroes, video-room)
src/lib            auth, bonuses, claude, media, security
server.ts          Next + Socket.IO
prisma/schema.prisma
prisma/seed.ts     5 kittys, heroes, admin flow, user invitado
public/media       fotos fuente (png) y webp generados por seed
```

Trabajamos el siguiente corte sobre este MVP: estética más fina, TURN, y pagos reales.
