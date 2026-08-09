import { NextResponse } from "next/server";
import { computeRoute } from "@/lib/router";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body?.fromPlaceId || !body?.toPlaceId) {
    return NextResponse.json({ error: "fromPlaceId and toPlaceId required" }, { status: 400 });
  }
  const route = computeRoute({
    fromPlaceId: body.fromPlaceId,
    toPlaceId: body.toPlaceId,
    avoidModes: body.avoidModes ?? []
  });
  if (!route) return NextResponse.json({ error: "No route found" }, { status: 404 });
  return NextResponse.json({ route });
}
