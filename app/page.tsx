import { cookies } from "next/headers";
import { harborConfig, health, restGet, mintJwt, jwtClaims } from "../lib/harbor";
export const dynamic = "force-dynamic";

type Health = Awaited<ReturnType<typeof health>>;
type Rest = Awaited<ReturnType<typeof restGet>>;

function healthPill(h: Health) {
  if (h.status === 200) return <span className="pill ok"><span className="dot" />Healthy</span>;
  if (h.status === 0) return <span className="pill err"><span className="dot" />Unreachable</span>;
  return <span className="pill warn"><span className="dot" />Degraded · HTTP {h.status}</span>;
}

export default async function Home({ searchParams }: { searchParams: Promise<{ mode?: string }> }) {
  const { mode } = await searchParams;
  const isSignup = mode === "signup";
  const cookieStore = await cookies();
  const flash = cookieStore.get("flash")?.value;   // "ok:msg" | "err:msg", short-lived
  const flashOk = flash?.startsWith("ok:");
  const flashMsg = flash?.slice(3);
  const cfg = harborConfig();
  const h = await health();

  // Signed-in state: the app holds the Harbor session token in an HttpOnly cookie.
  const sessionToken = cookieStore.get("hb_session")?.value ?? null;
  const jwt = sessionToken ? await mintJwt(sessionToken) : null;
  const claims = jwtClaims(jwt);
  const signedIn = !!jwt;

  const announcements = await restGet("announcements", "select=*&order=created_at.desc");
  const notes = await restGet("notes", "select=*&order=created_at.desc", jwt ?? undefined);

  return (
    <main>
      <header className="hero">
        <div>
          <h1>Omega × Harbor — Notes</h1>
          <p>A frontend deployed through Omega, backed by a Harbor database Omega provisioned. No Harbor API is called directly by the browser.</p>
        </div>
      </header>

      {flash && <div className={flashOk ? "ok-box" : "err-box"}>{flashOk ? "✓ " : ""}{flashMsg}</div>}

      <section className="card">
        <h2>Backend wiring {healthPill(h)}</h2>
        <div className="flow" style={{ marginBottom: 16 }}>
          <span className="step">CreateApp → CreateBackend</span><span className="arr">→</span>
          <span className="step">CreateDeployment → CreateBranch</span><span className="arr">→</span>
          <span className="step">migrations → public.*</span>
        </div>
        <dl className="kv">
          <dt>API URL</dt><dd><span className="chip">{cfg.apiUrl ?? "❌ not set"}</span></dd>
          <dt>Delivered by</dt><dd><span className="chip">{cfg.urlSource ?? "—"}</span></dd>
          <dt>Publishable key</dt>
          <dd>{cfg.publishableKey
            ? <span className="pill ok"><span className="dot" />set · {cfg.keySource}</span>
            : <span className="pill err"><span className="dot" />not set</span>}</dd>
          <dt>/health</dt><dd><span className="chip">{h.status ? `HTTP ${h.status} · ${h.body}` : h.body}</span></dd>
        </dl>
      </section>

      <section className="card">
        <h2>👤 Account {signedIn ? <span className="pill ok"><span className="dot" />signed in</span> : <span className="pill warn"><span className="dot" />anonymous</span>}</h2>
        {signedIn ? (
          <div className="user-row">
            <div>
              Signed in as <strong>{claims?.email ?? claims?.sub}</strong> — data-plane role <code>authenticated</code>, <code>auth.uid()</code> = <span className="chip">{claims?.sub}</span></div>
            <form action="/api/auth" method="post"><input type="hidden" name="intent" value="signout" /><button className="ghost" type="submit">Sign out</button></form>
          </div>
        ) : (
          <div className="auth-card">
            <div className="seg">
              <a href="/?mode=signin" className={!isSignup ? "active" : ""}>Sign in</a>
              <a href="/?mode=signup" className={isSignup ? "active" : ""}>Sign up</a>
            </div>
            <form action="/api/auth" method="post" className="auth-form">
              <input type="hidden" name="intent" value={isSignup ? "signup" : "signin"} />
              {isSignup && (
                <div className="field"><label htmlFor="name">Name</label><input id="name" name="name" placeholder="Ada Lovelace" /></div>
              )}
              <div className="field"><label htmlFor="email">Email</label><input id="email" name="email" type="email" required placeholder="you@example.com" /></div>
              <div className="field">
                <label htmlFor="password">Password</label>
                <input id="password" name="password" type="password" required minLength={8} placeholder="••••••••" />
                {isSignup && <span className="hint">At least 8 characters.</span>}
              </div>
              <button type="submit" className="block">{isSignup ? "Create account" : "Sign in"}</button>
            </form>
          </div>
        )}
      </section>

      <section className="card">
        <h2>📣 Announcements <span className="pill ok"><span className="dot" />public read</span></h2>
        <p className="sub">Public-read RLS policy — visible to everyone, even anonymous.</p>
        <Rows r={announcements} render={(a: any) => (
          <div className="note-card" key={a.id} data-testid="announcement"><div className="msg">{a.message}</div><div className="meta">{a.created_at}</div></div>
        )} emptyIcon="📭" emptyText="No announcements — deploy the migration to seed one." />
      </section>

      <section className="card">
        <h2>🔒 Notes <span className="pill warn"><span className="dot" />owner-scoped</span></h2>
        <p className="sub">Per-user RLS via <code>auth.uid()</code>. You only see your own rows; anonymous sees none.</p>
        {signedIn && (
          <form action="/api/notes" method="post" className="note-form">
            <input name="title" placeholder="Note title" required />
            <input name="body" placeholder="Body (optional)" />
            <button type="submit">Add note</button>
          </form>
        )}
        <Rows r={notes} render={(n: any) => (
          <div className="note-card" key={n.id}>
            <div className="msg">{n.title}</div>
            {n.body ? <div style={{ fontSize: 13.5, color: "var(--muted)" }}>{n.body}</div> : null}
            <div className="meta">{n.created_at}</div>
          </div>
        )} emptyIcon="🔒" emptyText={signedIn ? "No notes yet — add one above." : "Sign in to see and add your notes."} />
      </section>

      <p className="footnote">Omega Gen3 · Harbor alpha · auth + data provisioned through the Omega control plane</p>
    </main>
  );
}

function Rows({ r, render, emptyIcon, emptyText }: {
  r: Rest; render: (row: any) => React.ReactNode; emptyIcon: string; emptyText: string;
}) {
  if (!r.ok) return <div className="err-box">HTTP {r.status}{r.error ? ` — ${r.error}` : ""}</div>;
  const rows = Array.isArray(r.data) ? r.data : [];
  if (rows.length === 0) return <div className="empty"><span className="lock">{emptyIcon}</span>{emptyText}</div>;
  return <>{rows.map(render)}</>;
}
