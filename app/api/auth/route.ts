import { NextRequest, NextResponse } from "next/server";
import { signIn, signUp } from "../../../lib/harbor";

// Redirect to a RELATIVE path so the browser keeps its current host (localhost,
// not the server's 0.0.0.0 bind address) and the URL stays clean. Feedback rides
// in a short-lived `flash` cookie instead of query params.
function redirect(to: string, cookies: { name: string; value: string; opts?: any }[] = []) {
  const res = new NextResponse(null, { status: 303, headers: { Location: to } });
  for (const c of cookies) res.cookies.set(c.name, c.value, c.opts);
  return res;
}
const flash = (v: string) => ({ name: "flash", value: v, opts: { path: "/", maxAge: 10 } });

export async function POST(req: NextRequest) {
  const fd = await req.formData();
  const intent = String(fd.get("intent") || "signin");

  if (intent === "signout") {
    return redirect("/", [{ name: "hb_session", value: "", opts: { path: "/", maxAge: 0 } }]);
  }

  const email = String(fd.get("email") || "");
  const password = String(fd.get("password") || "");
  const name = String(fd.get("name") || "User");
  const r = intent === "signup" ? await signUp(email, password, name) : await signIn(email, password);

  if (r.sessionToken) {
    return redirect("/", [
      { name: "hb_session", value: r.sessionToken, opts: { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 7 } },
      flash(`ok:${intent === "signup" ? "Account created — you’re signed in." : "Signed in."}`),
    ]);
  }
  // Stay on the tab they used; show the error via flash.
  return redirect(intent === "signup" ? "/?mode=signup" : "/", [flash(`err:${(r.error || "Authentication failed").slice(0, 180)}`)]);
}
