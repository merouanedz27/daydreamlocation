import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export function GET() {
  const key = process.env.VAPID_PUBLIC_KEY;
  if (!key) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  return NextResponse.json({ key }, { headers: { "Cache-Control": "public, max-age=3600" } });
}