-- Harbor migration, applied through Omega -> BaD -> Harbor CreateDeployment.
-- Filename MUST match ^\d{14}_.+\.sql$ (14-digit UTC timestamp) or Harbor rejects the deploy.
-- Tables live in the PUBLIC schema (code-verified: PGRST_DB_SCHEMAS=public,
-- service_role has CREATE on public, auto-RLS trigger fires for public only).
-- Do NOT use the `harbor` schema (internal: migrations ledger + RLS machinery).

-- ---------------------------------------------------------------------------
-- announcements: PUBLIC-READABLE (demonstrates anon access + a seeded row)
-- ---------------------------------------------------------------------------
create table public.announcements (
    id         uuid primary key default gen_random_uuid(),
    message    text not null,
    created_at timestamptz not null default now()
);

-- RLS is auto-enabled on public tables by Harbor's ddl_command_end trigger; the
-- explicit enable is a harmless belt-and-suspenders.
alter table public.announcements enable row level security;

-- Anyone (anon role, i.e. just the publishable key) can read announcements.
create policy announcements_public_read
    on public.announcements for select
    using (true);

insert into public.announcements (message)
values ('Hello from Harbor, provisioned entirely through Omega.');

-- ---------------------------------------------------------------------------
-- notes: OWNER-SCOPED (demonstrates per-user RLS via auth.uid())
-- ---------------------------------------------------------------------------
create table public.notes (
    id         uuid primary key default gen_random_uuid(),
    -- user_id is TEXT, not uuid: Harbor's auth (BetterAuth) issues text nanoid user ids
    -- (e.g. "Ug2asUmpBUfM7kwjzKAqb7NCZ6N41Mz7"), and auth.uid() returns text. A uuid column
    -- both rejects the text default and breaks the RLS comparison below.
    -- Default it to the caller's identity so an authenticated insert can omit user_id.
    user_id    text not null default auth.uid(),
    title      text not null,
    body       text,
    created_at timestamptz not null default now()
);

alter table public.notes enable row level security;

-- Each end-user only sees / mutates their own rows. Anonymous callers (publishable key,
-- no JWT) match nothing -> they get an empty result, not an error (fails closed).
create policy notes_select_own on public.notes for select using (user_id = auth.uid());
create policy notes_insert_own on public.notes for insert with check (user_id = auth.uid());
create policy notes_update_own on public.notes for update using (user_id = auth.uid());
create policy notes_delete_own on public.notes for delete using (user_id = auth.uid());
