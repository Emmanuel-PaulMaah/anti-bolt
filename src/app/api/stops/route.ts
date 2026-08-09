import { NextResponse } from "next/server";
import { loadNetwork } from "@/lib/network";

export async function GET() {
  const network = loadNetwork();
  return NextResponse.json({ stops: network.stops });
}
