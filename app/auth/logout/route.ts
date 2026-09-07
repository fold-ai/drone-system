import { NextResponse } from "next/server";
import { AUTH } from "@/lib/auth/config";
import { cookieOptions } from "@/lib/auth/session";

export const runtime = "nodejs";

/** Clear the session cookie. Accepts POST only, so a link cannot sign you out. */
export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set({ ...cookieOptions(0), value: "" });
  return res;
}
