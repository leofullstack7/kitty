import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { processStaticMedia } from "../scripts/process-media";

const db = new PrismaClient();
const rounds = 12;

async function main() {
  await processStaticMedia();
  await db.chatMessage.deleteMany();
  await db.orbeBurst.deleteMany();
  await db.callSession.deleteMany();
  await db.proposal.deleteMany();
  await db.bonus.deleteMany();
  await db.orbeTransaction.deleteMany();
  await db.wallet.deleteMany();
  await db.mediaAsset.deleteMany();
  await db.notification.deleteMany();
  await db.auditLog.deleteMany();
  await db.heroBanner.deleteMany();
  await db.kittyProfile.deleteMany();
  await db.user.deleteMany();
  await db.platformSettings.deleteMany();

  await db.platformSettings.create({
    data: {
      id: "default",
      commissionRate: 0.28,
      maxBonusPercent: 25,
      autoApproveBelow: 15,
      bonusExpiryHours: 72,
      monthlyBonusCapPct: 15,
      orbCopValue: 10000,
    },
  });

  const admin = await db.user.create({
    data: {
      username: "flow",
      passwordHash: await bcrypt.hash("mamboneta123", rounds),
      role: "ADMIN",
      displayName: "Flow",
      wallet: { create: { balance: 0 } },
    },
  });

  const demoUser = await db.user.create({
    data: {
      username: "invitado",
      passwordHash: await bcrypt.hash("NocheVioleta1!", rounds),
      role: "USER",
      displayName: "Invitado",
      wallet: { create: { balance: 1_000_000 } },
    },
  });
  await db.orbeTransaction.create({
    data: {
      walletId: (await db.wallet.findUniqueOrThrow({ where: { userId: demoUser.id } })).id,
      type: "PURCHASE",
      orbes: 1_000_000,
      copValue: 0,
      note: "Orbes ilimitados de prueba",
    },
  });

  const catalog = [
    {
      username: "agatta",
      password: "AgattaMoon#26",
      displayName: "AGATTA",
      slug: "agatta",
      tagline: "No prometo dulzura. Prometo que no vas a querer colgar.",
      bio: "AGATTA no entra a una llamada para rellenar silencios. Entra para convertirlos en algo que recuerdes mañana. Si traes orbes, trae también una pregunta que valga la pena.",
      city: "Medellín",
      ageLabel: "27",
      tags: JSON.stringify(["misterio", "voz grave", "lujo", "confesiones"]),
      featured: true,
      isAvailable: true,
      coverPath: "/media/processed/agatta/cover.webp",
    },
    {
      username: "luna",
      password: "LunaViolet#26",
      displayName: "Luna",
      slug: "luna",
      tagline: "Suave como la medianoche. Peligrosa como quedarte.",
      bio: "Luna habla despacio a propósito. Cada frase es una invitación a quedarte un rato más. Ideal si buscas complicidad, no ruido.",
      city: "Bogotá",
      ageLabel: "25",
      tags: JSON.stringify(["dreamy", "playlist", "íntima"]),
      featured: false,
      isAvailable: true,
      coverPath: "/media/processed/luna/desktop.webp",
    },
    {
      username: "violeta",
      password: "VioletaFire#26",
      displayName: "Violeta",
      slug: "violeta",
      tagline: "Si tu noche está apagada, yo le pongo fuego violeta.",
      bio: "Risa fácil, miradas difíciles de sostener. Violeta vive para las conversaciones que se salen del guion. JOIN con valentía.",
      city: "Cali",
      ageLabel: "26",
      tags: JSON.stringify(["fuego", "humor", "atrevida"]),
      featured: false,
      isAvailable: true,
      coverPath: "/media/processed/violeta/desktop.webp",
    },
    {
      username: "nova",
      password: "NovaSpark#26",
      displayName: "Nova",
      slug: "nova",
      tagline: "Energía de after. Silencio de penthouse.",
      bio: "Nova aparece cuando la ciudad ya se rindió. Si estás despierto a esta hora, es porque buscabas exactamente esto.",
      city: "Barranquilla",
      ageLabel: "24",
      tags: JSON.stringify(["night owl", "neon", "directa"]),
      featured: false,
      isAvailable: false,
      coverPath: "/media/processed/nova/desktop.webp",
    },
    {
      username: "mika",
      password: "MikaPearl#26",
      displayName: "Mika",
      slug: "mika",
      tagline: "Dulce hasta que decides que no quieres dulce.",
      bio: "Mika es la puerta de entrada: cálida, juguetona, y perfectamente capaz de voltear la conversación en un segundo. Un JOIN inocente nunca lo es del todo.",
      city: "Cartagena",
      ageLabel: "25",
      tags: JSON.stringify(["playful", "soft", "bonos"]),
      featured: false,
      isAvailable: true,
      coverPath: "/media/processed/mika/desktop.webp",
    },
  ];

  for (const k of catalog) {
    const user = await db.user.create({
      data: {
        username: k.username,
        passwordHash: await bcrypt.hash(k.password, rounds),
        role: "KITTY",
        displayName: k.displayName,
        wallet: { create: { balance: 0 } },
        kittyProfile: {
          create: {
            slug: k.slug,
            tagline: k.tagline,
            bio: k.bio,
            city: k.city,
            ageLabel: k.ageLabel,
            tags: k.tags,
            featured: k.featured,
            isAvailable: k.isAvailable,
            avatarPath: `/media/processed/${k.slug}/card.webp`,
            coverPath: k.coverPath,
          },
        },
      },
      include: { kittyProfile: true },
    });
    await db.mediaAsset.create({
      data: {
        kittyId: user.kittyProfile!.id,
        type: "IMAGE",
        originalName: `${k.slug}.png`,
        webPath: `/media/processed/${k.slug}/card.webp`,
        mobilePath: `/media/processed/${k.slug}/mobile.webp`,
        desktopPath: `/media/processed/${k.slug}/desktop.webp`,
        posterPath: `/media/processed/${k.slug}/card.webp`,
        mime: "image/webp",
        bytes: 0,
        processed: true,
      },
    });
  }

  await db.heroBanner.createMany({
    data: [
      {
        title: "Ella ya está en línea",
        subtitle: "Cinco Kittys. Una noche. Un JOIN que no se pide dos veces.",
        ctaLabel: "Entrar al salón",
        ctaHref: "/explore",
        imageDesktop: "/media/processed/heroes/welcome-d.webp",
        imageMobile: "/media/processed/heroes/welcome-m.webp",
        sortOrder: 0,
        active: true,
      },
      {
        title: "AGATTA no espera",
        subtitle: "La Kitty más pedida de la casa. Si está disponible, no lo pienses: ofrece orbes y entra.",
        ctaLabel: "Buscar a AGATTA",
        ctaHref: "/k/agatta",
        imageDesktop: "/media/processed/heroes/agatta-d.webp",
        imageMobile: "/media/processed/heroes/agatta-m.webp",
        sortOrder: 1,
        active: true,
      },
      {
        title: "1 orbe = $10.000",
        subtitle: "Propón la actividad. Propón los orbes. Ella decide si tu noche vale la pena.",
        ctaLabel: "Cargar orbes",
        ctaHref: "/wallet",
        imageDesktop: "/media/processed/heroes/orbes-d.webp",
        imageMobile: "/media/processed/heroes/orbes-m.webp",
        sortOrder: 2,
        active: true,
      },
      {
        title: "Privado. En vivo. Sin relleno.",
        subtitle: "Videollamada 1:1, chat tipo streaming y orbes que suben como reacciones. Esto no es un feed. Es una habitación.",
        ctaLabel: "Ver quién está live",
        ctaHref: "/explore",
        imageDesktop: "/media/processed/heroes/live-d.webp",
        imageMobile: "/media/processed/heroes/live-m.webp",
        sortOrder: 3,
        active: true,
      },
    ],
  });

  const mika = await db.kittyProfile.findUniqueOrThrow({ where: { slug: "mika" } });
  await db.bonus.create({
    data: {
      kittyId: mika.id,
      userId: demoUser.id,
      percent: 15,
      code: "KTY-MIKA15",
      status: "ACTIVE",
      expiresAt: new Date(Date.now() + 72 * 3600_000),
      note: "Bienvenida de Mika para el invitado de la casa",
    },
  });

  await db.notification.create({
    data: {
      userId: demoUser.id,
      title: "Mika te dejó un bono",
      body: "15% solo con ella. 72 horas. Úsalo en tu próximo JOIN.",
      href: "/k/mika",
    },
  });

  console.log("Seed OK");
  console.log("ADMIN  flow / mamboneta123");
  console.log("USER   invitado / NocheVioleta1!");
  console.log("KITTY  agatta / AgattaMoon#26");
  void admin;
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
