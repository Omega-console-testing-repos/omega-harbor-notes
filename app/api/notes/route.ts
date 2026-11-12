import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { mintJwt, restInsert } from "../../../lib/harbor";

function redirect(to: string, flash?: string) {
  const res = new NextResponse(null, { status: 303, headers: { Location: to } });
  if (flash) res.cookies.set("flash", flash, { path: "/", maxAge: 10 });
  return res;
}

export async function POST(req: NextRequest) {
  const fd = await req.formData();
  const st = (await cookies()).get("hb_session")?.value;
  const title = String(fd.get("title") || "").trim();
  if (!st) return redirect("/", "err:Sign in first.");
  if (!title) return redirect("/", "err:Title is required.");
  const jwt = await mintJwt(st);
  if (!jwt) return redirect("/", "err:Session expired — sign in again.");
  const ins = await restInsert("notes", { title, body: String(fd.get("body") || "") }, jwt);
  return redirect("/", ins.ok ? "ok:Note added." : `err:${(ins.error || "Insert failed").slice(0, 180)}`);
}
