import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().min(1).default("postgresql://postgres:postgres@127.0.0.1:5432/kitty"),
  JWT_SECRET: z.string().min(32).default("build-placeholder-jwt-secret-not-for-runtime"),
  ANTHROPIC_API_KEY: z.string().optional().default(""),
  APP_ORIGIN: z.string().default("http://localhost:3000"),
});

export const env = schema.parse({
  DATABASE_URL: process.env.DATABASE_URL,
  JWT_SECRET: process.env.JWT_SECRET,
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ?? "",
  APP_ORIGIN: process.env.APP_ORIGIN ?? "http://localhost:3000",
});
