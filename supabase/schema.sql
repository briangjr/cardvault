-- ===========================================================================
-- Card Vault — Supabase schema
-- Run this once in your Supabase project's SQL editor (Database > SQL Editor).
-- ===========================================================================

-- ---------- Table: cards ----------
create table if not exists public.cards (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),

  player text,
  team text,
  sport text default 'other',
  year text,
  set_name text,
  card_number text,
  parallel text,
  features text[] default '{}',

  front_image_url text,
  back_image_url text,
  edge_image_urls text[] default '{}',

  value_low numeric,
  value_high numeric,
  value_mid numeric,
  value_basis text,
  value_as_of text,
  value_comps jsonb default '[]',

  psa_grade_low numeric,
  psa_grade_high numeric,
  psa_categories jsonb,
  psa_summary text
);

create index if not exists cards_created_at_idx on public.cards (created_at desc);
create index if not exists cards_sport_idx on public.cards (sport);

-- ---------- Row Level Security ----------
-- NOTE: This app has no per-user login — it's built for ONE collector using
-- their own Supabase project, with the Netlify app's passcode screen as the
-- front door. The policies below intentionally allow the public ("anon")
-- Supabase key full read/write on this table, because that key is what the
-- browser app uses directly. Keep your Supabase project URL + passcode
-- private; don't publish them. If you ever want this locked down further,
-- add Supabase Auth and scope these policies to auth.uid().
alter table public.cards enable row level security;

create policy "anon can read cards" on public.cards
  for select using (true);

create policy "anon can insert cards" on public.cards
  for insert with check (true);

create policy "anon can update cards" on public.cards
  for update using (true);

create policy "anon can delete cards" on public.cards
  for delete using (true);

-- ---------- Storage bucket for card photos ----------
-- Create a public bucket called "card-images" (Storage > New bucket, toggle
-- "Public bucket" ON) — or run this instead:
insert into storage.buckets (id, name, public)
values ('card-images', 'card-images', true)
on conflict (id) do nothing;

create policy "public read card-images" on storage.objects
  for select using (bucket_id = 'card-images');

create policy "anon upload card-images" on storage.objects
  for insert with check (bucket_id = 'card-images');

create policy "anon delete card-images" on storage.objects
  for delete using (bucket_id = 'card-images');
