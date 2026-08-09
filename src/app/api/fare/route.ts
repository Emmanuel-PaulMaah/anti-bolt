import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body.amount !== "number" || body.amount < 0 || !body.fromStopId || !body.toStopId || !body.mode) {
    return NextResponse.json({ error: "fromStopId, toStopId, mode and amount required" }, { status: 400 });
  }
  const file = path.join(process.cwd(), "data", "fare_feedback.jsonl");
  const line = JSON.stringify({ ts: new Date().toISOString(), ...body });
  fs.appendFileSync(file, line + "\n");
  return NextResponse.json({ ok: true });
}
