import { NextResponse } from "next/server";
import { loadNetwork, findPlaceByQuery } from "@/lib/network";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q") ?? "";
  const network = loadNetwork();
  const results = q ? findPlaceByQuery(network, q).slice(0, 10) : [];
  return NextResponse.json({ results });
}
