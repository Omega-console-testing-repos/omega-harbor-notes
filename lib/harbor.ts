// Server-side Harbor data-plane + auth client for the sample. No @amzn/* dependency
// (the Harbor client SDK is not published to a registry the Omega build can reach), so
// we talk to Harbor's PostgREST + BetterAuth surfaces directly over fetch. All of this
// runs on the Next.js server: the BetterAuth session cookie is HttpOnly + SameSite=Lax on
// the backend's domain, so the browser can't use it cross-site — the server holds it.

const URL_CANDIDATES = ["HARBOR_API_URL", "NEXT_PUBLIC_HARBOR_API_URL"];
const KEY_CANDIDATES = ["HARBOR_PUBLISHABLE_KEY", "NEXT_PUBLIC_HARBOR_PUBLISHABLE_KEY"];
const SESSION_COOKIE = "__Secure-harbor.session_token";

function pick(names: string[]): { name: string; value: string } | null {
  for (const n of names) {
    const v = process.env[n];
    if (v && v.trim()) return { name: n, value: v.trim() };
  }
  return null;
}

export function harborConfig() {
  const url = pick(URL_CANDIDATES);
  const key = pick(KEY_CANDIDATES);
  return {
    apiUrl: url?.value ?? null,
    urlSource: url?.name ?? null,
    publishableKey: key?.value ?? null,
    keySource: key?.name ?? null,
  };
}

function base() {
  const c = harborConfig();
  if (!c.apiUrl || !c.publishableKey) return null;
  return { url: c.apiUrl.replace(/\/$/, ""), key: c.publishableKey };
}

// Harbor MicroVMs suspend when idle; the first request after can throw a
// connection-level "fetch failed". Retry a couple times to ride out the cold start.
async function fetchRetry(url: string, init: RequestInit, tries = 3): Promise<Response> {
  let lastErr: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      return await fetch(url, init);
    } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, 700 * (i + 1)));
    }
  }
  throw lastErr;
}

export async function health() {
  const b = base();
  if (!b) return { ok: false, status: 0, body: "HARBOR_API_URL / key not set" };
  try {
    const res = await fetchRetry(`${b.url}/health`, { headers: { apikey: b.key }, cache: "no-store" });
    return { ok: res.ok, status: res.status, body: await res.text() };
  } catch (e) {
    return { ok: false, status: 0, body: String(e) };
  }
}

// ---- Auth (BetterAuth) -----------------------------------------------------
async function authPost(path: string, body: object) {
  const b = base();
  if (!b) return { ok: false, status: 0, error: "backend env not set", sessionToken: null as string | null };
  try {
    const res = await fetchRetry(`${b.url}/auth${path}`, {
      method: "POST",
      // Harbor's BetterAuth enforces an Origin check (rejects MISSING_OR_NULL_ORIGIN).
      // Use the backend's own origin, which it trusts.
      headers: { apikey: b.key, "content-type": "application/json", origin: b.url },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    const setCookie = res.headers.get("set-cookie") || "";
    const m = setCookie.match(/__Secure-harbor\.session_token=([^;]+)/);
    const text = await res.text();
    return { ok: res.ok, status: res.status, error: res.ok ? null : text, sessionToken: m ? m[1] : null };
  } catch (e) {
    return { ok: false, status: 0, error: String(e), sessionToken: null };
  }
}

export const signUp = (email: string, password: string, name: string) =>
  authPost("/sign-up/email", { email, password, name });
export const signIn = (email: string, password: string) =>
  authPost("/sign-in/email", { email, password });

/** Exchange the stored session cookie for a short-lived data-plane JWT. */
export async function mintJwt(sessionToken: string): Promise<string | null> {
  const b = base();
  if (!b) return null;
  try {
    const res = await fetchRetry(`${b.url}/auth/token`, {
      headers: { apikey: b.key, cookie: `${SESSION_COOKIE}=${sessionToken}`, origin: b.url },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const j = (await res.json().catch(() => null)) as { token?: string } | null;
    return j?.token ?? null;
  } catch {
    return null;
  }
}

/** Decode a JWT payload (no verification — display only). */
export function jwtClaims(jwt: string | null): { email?: string; name?: string; sub?: string } | null {
  if (!jwt) return null;
  try {
    const p = jwt.split(".")[1];
    return JSON.parse(Buffer.from(p.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString());
  } catch {
    return null;
  }
}

// ---- Data plane (PostgREST at /rest, unversioned) --------------------------
export async function restGet(table: string, query = "select=*", jwt?: string) {
  const b = base();
  if (!b) return { ok: false, status: 0, error: "backend env not set", data: null as unknown };
  const headers: Record<string, string> = { apikey: b.key };
  if (jwt) headers.Authorization = `Bearer ${jwt}`; // no JWT => anon role
  try {
    const res = await fetchRetry(`${b.url}/rest/${table}?${query}`, { headers, cache: "no-store" });
    const text = await res.text();
    let data: unknown = text;
    try { data = JSON.parse(text); } catch { /* keep text */ }
    return { ok: res.ok, status: res.status, error: res.ok ? null : text, data };
  } catch (e) {
    return { ok: false, status: 0, error: String(e), data: null };
  }
}

export async function restInsert(table: string, row: object, jwt: string) {
  const b = base();
  if (!b) return { ok: false, status: 0, error: "backend env not set" };
  try {
    const res = await fetchRetry(`${b.url}/rest/${table}`, {
      method: "POST",
      headers: {
        apikey: b.key,
        Authorization: `Bearer ${jwt}`,
        "content-type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify(row),
      cache: "no-store",
    });
    return { ok: res.ok, status: res.status, error: res.ok ? null : await res.text() };
  } catch (e) {
    return { ok: false, status: 0, error: String(e) };
  }
}
