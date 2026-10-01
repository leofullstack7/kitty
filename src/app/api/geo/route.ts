import { NextRequest, NextResponse } from "next/server";
import { checkoutPayload, detectCountry } from "@/lib/payments";

export async function GET(req: NextRequest) {
  const country = detectCountry(req);
  return NextResponse.json({ detected: true, ...checkoutPayload(country) });
}
