-- AthleteOrbit database schema (Supabase / Postgres)
-- Run once in Supabase: SQL Editor > New query > paste > Run.
-- Every table is locked by row-level security: a family only ever sees its own rows.

create extension if not exists pgcrypto;

-- One row per parent account (created automatically on sign-up)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  stripe_customer_id text unique,
  subscription_status text not null default 'none',   -- none | trialing | active | past_due | canceled
  subscription_plan text,                               -- monthly | yearly
  current_period_end timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.gymnasts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  program text not null check (program in ('WAG','MAG','Xcel')),
  level text not null,
  club text,
  created_at timestamptz not null default now()
);

create table if not exists public.meets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  gymnast_id uuid not null references public.gymnasts(id) on delete cascade,
  name text not null,
  host text,
  location text,
  start_date date not null,
  end_date date,
  session_time text,
  status text not null default 'Planned' check (status in ('Planned','Registered','Paid','Completed','Skipped')),
  entry_deadline date,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.scores (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  gymnast_id uuid not null references public.gymnasts(id) on delete cascade,
  meet_name text not null,
  meet_date date not null,
  level text,
  vault numeric(6,3), bars numeric(6,3), beam numeric(6,3), floor numeric(6,3),
  pommel numeric(6,3), rings numeric(6,3), pbars numeric(6,3), highbar numeric(6,3),
  aa_place int,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.costs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  gymnast_id uuid references public.gymnasts(id) on delete cascade,   -- null = family/shared
  spent_on date not null,
  category text not null,
  description text,
  amount numeric(10,2) not null check (amount >= 0),
  paid boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.skill_status (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  gymnast_id uuid not null references public.gymnasts(id) on delete cascade,
  skill_key text not null,                 -- e.g. WAG|Level 5|Floor|Front handspring step-out
  status text not null check (status in ('Not started','Learning','Drill','Have it','Competed')),
  updated_at timestamptz not null default now(),
  primary key (gymnast_id, skill_key)
);

-- AI usage log for fair-use limits (written only by the server)
create table if not exists public.ai_usage (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null,                       -- coach | scoresheet | video | readiness
  created_at timestamptz not null default now()
);
create index if not exists ai_usage_user_day on public.ai_usage (user_id, created_at);

-- Saved AI feedback (video notes, readiness plans) so parents can look back
create table if not exists public.ai_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  gymnast_id uuid references public.gymnasts(id) on delete cascade,
  kind text not null,
  title text,
  body text not null,
  created_at timestamptz not null default now()
);

-- A gymnast id written into a child table must belong to the same parent
create or replace function public.owns_gymnast(g uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select g is null or exists (select 1 from public.gymnasts where id = g and user_id = auth.uid());
$$;

alter table public.profiles     enable row level security;
alter table public.gymnasts     enable row level security;
alter table public.meets        enable row level security;
alter table public.scores       enable row level security;
alter table public.costs        enable row level security;
alter table public.skill_status enable row level security;
alter table public.ai_usage     enable row level security;
alter table public.ai_notes     enable row level security;

-- profiles: read own row; parents may edit only their name (billing fields are server-only)
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select using (id = auth.uid());
revoke update on public.profiles from authenticated, anon;
grant update (full_name) on public.profiles to authenticated;
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists gymnasts_all on public.gymnasts;
create policy gymnasts_all on public.gymnasts for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists meets_all on public.meets;
create policy meets_all on public.meets for all
  using (user_id = auth.uid()) with check (user_id = auth.uid() and public.owns_gymnast(gymnast_id));

drop policy if exists scores_all on public.scores;
create policy scores_all on public.scores for all
  using (user_id = auth.uid()) with check (user_id = auth.uid() and public.owns_gymnast(gymnast_id));

drop policy if exists costs_all on public.costs;
create policy costs_all on public.costs for all
  using (user_id = auth.uid()) with check (user_id = auth.uid() and public.owns_gymnast(gymnast_id));

drop policy if exists skill_all on public.skill_status;
create policy skill_all on public.skill_status for all
  using (user_id = auth.uid()) with check (user_id = auth.uid() and public.owns_gymnast(gymnast_id));

drop policy if exists notes_all on public.ai_notes;
create policy notes_all on public.ai_notes for all
  using (user_id = auth.uid()) with check (user_id = auth.uid() and public.owns_gymnast(gymnast_id));

drop policy if exists usage_select on public.ai_usage;
create policy usage_select on public.ai_usage for select using (user_id = auth.uid());
-- no insert/update/delete policy: only the server (service role) writes usage

-- Free plan limit: 1 gymnast without an active subscription (enforced in the database)
create or replace function public.enforce_gymnast_limit() returns trigger
language plpgsql security definer set search_path = public as $$
declare st text; n int;
begin
  select subscription_status into st from public.profiles where id = new.user_id;
  select count(*) into n from public.gymnasts where user_id = new.user_id;
  if coalesce(st,'none') not in ('active','trialing') and n >= 1 then
    raise exception 'Free plan includes 1 gymnast. Start your free trial to add more.';
  end if;
  if n >= 6 then raise exception 'Maximum 6 gymnasts per family.'; end if;
  return new;
end $$;
drop trigger if exists gymnast_limit on public.gymnasts;
create trigger gymnast_limit before insert on public.gymnasts
  for each row execute function public.enforce_gymnast_limit();

-- Create a profile automatically when a parent signs up
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email) values (new.id, new.email) on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- =====================================================================
-- v2: reminders, travel, packing lists, clubs, support inbox
-- Safe to re-run: every statement checks before creating.
-- =====================================================================

alter table public.profiles add column if not exists email_reminders boolean not null default true;
alter table public.profiles add column if not exists sms_reminders boolean not null default false;
alter table public.profiles add column if not exists phone text;
alter table public.profiles add column if not exists home_city text;
alter table public.profiles add column if not exists home_airport text;
alter table public.profiles add column if not exists club_id uuid;
alter table public.profiles add column if not exists is_admin boolean not null default false;
grant update (full_name, email_reminders, sms_reminders, phone, home_city, home_airport) on public.profiles to authenticated;

alter table public.meets add column if not exists checklist jsonb not null default '[]'::jsonb;

-- One row per reminder sent, so nobody gets the same reminder twice
create table if not exists public.reminders_sent (
  meet_id uuid not null references public.meets(id) on delete cascade,
  kind text not null,               -- e.g. meet-7, deadline-2
  channel text not null,            -- email | sms
  sent_at timestamptz not null default now(),
  primary key (meet_id, kind, channel)
);
alter table public.reminders_sent enable row level security;   -- server only

-- Gym / club plans: one purchase gives every family in the gym Pro
create table if not exists public.clubs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text not null unique,
  owner_id uuid references auth.users(id) on delete set null,
  contact_email text,
  seats int not null default 50,
  active_until timestamptz,
  stripe_customer_id text,
  created_at timestamptz not null default now()
);
alter table public.clubs enable row level security;
drop policy if exists clubs_member_read on public.clubs;
create policy clubs_member_read on public.clubs for select
  using (owner_id = auth.uid() or id = (select club_id from public.profiles where id = auth.uid()));
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_club_fk') then
    alter table public.profiles add constraint profiles_club_fk foreign key (club_id) references public.clubs(id) on delete set null;
  end if;
end $$;

-- Contact-us messages (written by the server; parents can read their own)
create table if not exists public.support_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  email text not null,
  name text,
  phone text,
  topic text,
  message text not null,
  ai_draft text,
  status text not null default 'open' check (status in ('open','answered','closed')),
  reply text,
  replied_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.support_messages enable row level security;
drop policy if exists support_own on public.support_messages;
create policy support_own on public.support_messages for select using (user_id = auth.uid());

-- Pro = own subscription OR membership in a club with an active plan
create or replace function public.is_pro(u uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles p where p.id = u and p.subscription_status in ('active','trialing'))
      or exists (select 1 from public.profiles p join public.clubs c on c.id = p.club_id where p.id = u and c.active_until > now());
$$;

create or replace function public.enforce_gymnast_limit() returns trigger
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  select count(*) into n from public.gymnasts where user_id = new.user_id;
  if not public.is_pro(new.user_id) and n >= 1 then
    raise exception 'Free plan includes 1 gymnast. Start your free trial to add more.';
  end if;
  if n >= 6 then raise exception 'Maximum 6 gymnasts per family.'; end if;
  return new;
end $$;
alter table public.clubs add column if not exists stripe_subscription_id text unique;

-- =====================================================================
-- v3: family view, other sports, goals, coach notes, budgets,
--     family calendar, club announcements
-- =====================================================================

-- Gymnastics stays first; a child can also be set up for another sport with simple stats.
alter table public.gymnasts add column if not exists sport text not null default 'Gymnastics';
alter table public.gymnasts add column if not exists coach_name text;
alter table public.gymnasts add column if not exists coach_email text;
alter table public.gymnasts add column if not exists coach_phone text;
alter table public.gymnasts add column if not exists color text;
alter table public.gymnasts drop constraint if exists gymnasts_program_check;
alter table public.gymnasts add constraint gymnasts_program_check check (program in ('WAG','MAG','Xcel','Other'));

-- Results for other sports (swim times, soccer goals, etc.) and personal records
create table if not exists public.stats (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  gymnast_id uuid not null references public.gymnasts(id) on delete cascade,
  event_date date not null,
  event_name text,                       -- meet / game / tournament
  metric text not null,                  -- e.g. "50 Free", "Goals"
  value numeric not null,
  unit text,                             -- sec, goals, pts, m
  better text not null default 'higher' check (better in ('higher','lower')),
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  gymnast_id uuid not null references public.gymnasts(id) on delete cascade,
  title text not null,
  target_date date,
  done boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.coach_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  gymnast_id uuid not null references public.gymnasts(id) on delete cascade,
  noted_on date not null default current_date,
  source text not null default 'Coach',  -- Coach | Practice | Meet | Parent
  body text not null,
  created_at timestamptz not null default now()
);

-- Season budgets: whole family (gymnast_id null) or per child; whole budget (category null) or per category
create table if not exists public.budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  season text not null,                  -- "2026-27" (Aug 1 to Jul 31)
  gymnast_id uuid references public.gymnasts(id) on delete cascade,
  category text,
  amount numeric(10,2) not null check (amount >= 0),
  created_at timestamptz not null default now()
);

-- Meet extras: hotel booking details, estimated trip cost; costs can link to a meet
alter table public.meets add column if not exists hotel_name text;
alter table public.meets add column if not exists hotel_confirmation text;
alter table public.meets add column if not exists hotel_address text;
alter table public.meets add column if not exists estimated_cost numeric(10,2);
alter table public.costs add column if not exists meet_id uuid references public.meets(id) on delete set null;

-- Family calendar: practices, recitals, trips, anything that can clash with a meet
create table if not exists public.family_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  gymnast_id uuid references public.gymnasts(id) on delete cascade,   -- null = whole family
  title text not null,
  start_date date not null,
  end_date date,
  start_time text,
  location text,
  notes text,
  created_at timestamptz not null default now()
);

-- Club announcements (written by the club owner through the server)
create table if not exists public.club_announcements (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  title text not null,
  body text not null,
  created_at timestamptz not null default now()
);

alter table public.stats enable row level security;
alter table public.goals enable row level security;
alter table public.coach_notes enable row level security;
alter table public.budgets enable row level security;
alter table public.family_events enable row level security;
alter table public.club_announcements enable row level security;

drop policy if exists stats_all on public.stats;
create policy stats_all on public.stats for all using (user_id = auth.uid()) with check (user_id = auth.uid() and public.owns_gymnast(gymnast_id));
drop policy if exists goals_all on public.goals;
create policy goals_all on public.goals for all using (user_id = auth.uid()) with check (user_id = auth.uid() and public.owns_gymnast(gymnast_id));
drop policy if exists cnotes_all on public.coach_notes;
create policy cnotes_all on public.coach_notes for all using (user_id = auth.uid()) with check (user_id = auth.uid() and public.owns_gymnast(gymnast_id));
drop policy if exists budgets_all on public.budgets;
create policy budgets_all on public.budgets for all using (user_id = auth.uid()) with check (user_id = auth.uid() and public.owns_gymnast(gymnast_id));
drop policy if exists fevents_all on public.family_events;
create policy fevents_all on public.family_events for all using (user_id = auth.uid()) with check (user_id = auth.uid() and public.owns_gymnast(gymnast_id));
drop policy if exists announce_read on public.club_announcements;
create policy announce_read on public.club_announcements for select
  using (club_id = (select club_id from public.profiles where id = auth.uid())
         or club_id in (select id from public.clubs where owner_id = auth.uid()));

-- A cost may only point at the parent's own meet
create or replace function public.owns_meet(m uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select m is null or exists (select 1 from public.meets where id = m and user_id = auth.uid());
$$;
drop policy if exists costs_all on public.costs;
create policy costs_all on public.costs for all
  using (user_id = auth.uid()) with check (user_id = auth.uid() and public.owns_gymnast(gymnast_id) and public.owns_meet(meet_id));

-- Weekly money digest log (server only)
create table if not exists public.digests_sent (
  user_id uuid not null references auth.users(id) on delete cascade,
  week text not null,
  sent_at timestamptz not null default now(),
  primary key (user_id, week)
);
alter table public.digests_sent enable row level security;

-- =====================================================================
-- v4: usernames, account types (parent / gym owner), plan names
-- =====================================================================
alter table public.profiles add column if not exists username text;
alter table public.profiles add column if not exists account_type text not null default 'parent';
alter table public.profiles add column if not exists gym_name text;
alter table public.profiles drop constraint if exists profiles_account_type_check;
alter table public.profiles add constraint profiles_account_type_check check (account_type in ('parent','gym'));
alter table public.profiles drop constraint if exists profiles_username_format;
alter table public.profiles add constraint profiles_username_format check (username is null or username ~ '^[a-z0-9_]{3,20}$');
create unique index if not exists profiles_username_key on public.profiles (lower(username));
-- subscription_plan now holds monthly | quarterly | semiannual | yearly

-- New accounts carry their username, name and account type from the sign-up form.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare m jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
begin
  insert into public.profiles (id, email, username, full_name, account_type, gym_name)
  values (new.id, new.email,
          nullif(lower(m->>'username'), ''),
          nullif(m->>'full_name', ''),
          case when m->>'account_type' = 'gym' then 'gym' else 'parent' end,
          nullif(m->>'gym_name', ''))
  on conflict (id) do nothing;
  return new;
exception when unique_violation then
  raise exception 'USERNAME_TAKEN';
end $$;

-- Keep the profile email in step when a parent changes their sign-in email
create or replace function public.handle_user_email() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.email is distinct from old.email then update public.profiles set email = new.email where id = new.id; end if;
  return new;
end $$;
drop trigger if exists on_auth_user_email on auth.users;
create trigger on_auth_user_email after update of email on auth.users
  for each row execute function public.handle_user_email();
alter table public.clubs add column if not exists plan text;

-- =====================================================================
-- v5: sports chosen by each family, profile photos
-- =====================================================================
alter table public.profiles add column if not exists sports text[] not null default '{}';
alter table public.profiles add column if not exists avatar text;          -- small square JPEG as a data URL (private by RLS)
alter table public.gymnasts add column if not exists photo text;
alter table public.clubs add column if not exists sport text;
alter table public.profiles drop constraint if exists profiles_avatar_size;
alter table public.profiles add constraint profiles_avatar_size check (avatar is null or length(avatar) < 80000);
alter table public.gymnasts drop constraint if exists gymnasts_photo_size;
alter table public.gymnasts add constraint gymnasts_photo_size check (photo is null or length(photo) < 80000);
grant update (full_name, email_reminders, sms_reminders, phone, home_city, home_airport, sports, avatar) on public.profiles to authenticated;

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare m jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
begin
  insert into public.profiles (id, email, username, full_name, account_type, gym_name, sports)
  values (new.id, new.email,
          nullif(lower(m->>'username'), ''),
          nullif(m->>'full_name', ''),
          case when m->>'account_type' = 'gym' then 'gym' else 'parent' end,
          nullif(m->>'gym_name', ''),
          case when m ? 'sport' and m->>'sport' <> '' then array[m->>'sport'] else '{}'::text[] end)
  on conflict (id) do nothing;
  return new;
exception when unique_violation then
  raise exception 'USERNAME_TAKEN';
end $$;

-- ============ v6: 7-day free trial for every new account, no free tier ============
alter table public.profiles add column if not exists trial_ends_at timestamptz default (now() + interval '7 days');
update public.profiles set trial_ends_at = coalesce(created_at, now()) + interval '7 days' where trial_ends_at is null;

create or replace function public.is_pro(u uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles p where p.id = u and (p.subscription_status in ('active','trialing') or p.trial_ends_at > now()))
      or exists (select 1 from public.profiles p join public.clubs c on c.id = p.club_id where p.id = u and c.active_until > now());
$$;

create or replace function public.enforce_gymnast_limit() returns trigger
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not public.is_pro(new.user_id) then
    raise exception 'Your free trial has ended. Choose a AthleteOrbit plan to keep tracking.';
  end if;
  select count(*) into n from public.gymnasts where user_id = new.user_id;
  if n >= 6 then raise exception 'Maximum 6 athletes per family.'; end if;
  return new;
end $$;

-- ============ v7: Basic / Plus / Pro tiers, online score imports ============
alter table public.profiles add column if not exists subscription_tier text check (subscription_tier in ('basic','plus','pro'));
alter table public.profiles add column if not exists stripe_subscription_id text;
update public.profiles set subscription_tier = 'plus' where subscription_tier is null and subscription_status in ('active','trialing','past_due');

-- Link to the official results page for a meet (MeetScoresOnline etc.)
alter table public.meets add column if not exists results_url text check (results_url is null or length(results_url) < 500);

-- Scores found online, waiting for the parent to confirm
create table if not exists public.score_imports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  gymnast_id uuid not null references public.gymnasts(id) on delete cascade,
  meet_id uuid references public.meets(id) on delete set null,
  source_url text not null,
  data jsonb not null,
  status text not null default 'pending' check (status in ('pending','saved','dismissed')),
  created_at timestamptz not null default now()
);
create index if not exists score_imports_user on public.score_imports(user_id, status);
alter table public.score_imports enable row level security;
drop policy if exists imports_own on public.score_imports;
create policy imports_own on public.score_imports for all using (user_id = auth.uid()) with check (user_id = auth.uid());
-- Name exactly as it appears on online results (e.g. "Maya Patel")
alter table public.gymnasts add column if not exists results_name text check (results_name is null or length(results_name) <= 80);

-- ============ v8: practice & wellness log, qualifying scores, family share link ============
create table if not exists public.practice_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  gymnast_id uuid not null references public.gymnasts(id) on delete cascade,
  practiced_on date not null default current_date,
  minutes int not null check (minutes between 0 and 600),
  kind text not null default 'Practice' check (kind in ('Practice','Private lesson','Conditioning','Competition','Rest day')),
  energy int check (energy between 1 and 5),
  pain int not null default 0 check (pain between 0 and 10),
  pain_area text check (pain_area is null or length(pain_area) <= 40),
  notes text check (notes is null or length(notes) <= 500),
  created_at timestamptz not null default now()
);
create index if not exists practice_logs_g on public.practice_logs(gymnast_id, practiced_on);
alter table public.practice_logs enable row level security;
drop policy if exists practice_own on public.practice_logs;
create policy practice_own on public.practice_logs for all using (user_id = auth.uid() and public.owns_gymnast(gymnast_id)) with check (user_id = auth.uid() and public.owns_gymnast(gymnast_id));

create table if not exists public.qualifiers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  gymnast_id uuid not null references public.gymnasts(id) on delete cascade,
  name text not null check (length(name) between 1 and 80),
  metric text not null check (length(metric) <= 40),      -- 'aa' | 'vault' | ... | stat metric like '50 Free'
  target numeric not null,
  better text not null default 'higher' check (better in ('higher','lower')),
  by_date date,
  created_at timestamptz not null default now()
);
alter table public.qualifiers enable row level security;
drop policy if exists qualifiers_own on public.qualifiers;
create policy qualifiers_own on public.qualifiers for all using (user_id = auth.uid() and public.owns_gymnast(gymnast_id)) with check (user_id = auth.uid() and public.owns_gymnast(gymnast_id));

-- Read-only family page: a random key per child; clearing it turns the link off.
alter table public.gymnasts add column if not exists share_key text;

-- ============ v9: one signed-in device at a time, referrals ============
alter table public.profiles add column if not exists active_session text;
alter table public.profiles add column if not exists active_session_at timestamptz;
-- Direct database reads from an older device are refused too (not just the API).
create or replace function public.session_ok() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select p.active_session is null or p.active_session = (auth.jwt() ->> 'session_id') from public.profiles p where p.id = auth.uid()), true);
$$;
create or replace function public.owns_gymnast(g uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.session_ok() and (g is null or exists (select 1 from public.gymnasts where id = g and user_id = auth.uid()));
$$;
drop policy if exists gymnasts_all on public.gymnasts;
create policy gymnasts_all on public.gymnasts for all
  using (user_id = auth.uid() and public.session_ok()) with check (user_id = auth.uid() and public.session_ok());

-- Referrals ("give a month, get a month") and where each sign-up came from (for marketing).
alter table public.profiles add column if not exists referral_code text;
alter table public.profiles add column if not exists referred_by text;
alter table public.profiles add column if not exists referral_rewarded boolean not null default false;
alter table public.profiles add column if not exists signup_source text check (signup_source is null or length(signup_source) <= 120);
create unique index if not exists profiles_referral_code on public.profiles (lower(referral_code));
update public.profiles set referral_code = upper(substr(md5(id::text), 1, 6)) where referral_code is null;

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare m jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
begin
  insert into public.profiles (id, email, username, full_name, account_type, gym_name, sports, referral_code, referred_by, signup_source)
  values (new.id, new.email,
          nullif(lower(m->>'username'), ''),
          nullif(m->>'full_name', ''),
          case when m->>'account_type' = 'gym' then 'gym' else 'parent' end,
          nullif(m->>'gym_name', ''),
          case when m ? 'sport' and m->>'sport' <> '' then array[m->>'sport'] else '{}'::text[] end,
          upper(substr(md5(new.id::text), 1, 6)),
          nullif(upper(left(regexp_replace(coalesce(m->>'ref', ''), '[^A-Za-z0-9]', '', 'g'), 12)), ''),
          nullif(left(m->>'source', 120), ''))
  on conflict (id) do nothing;
  return new;
exception when unique_violation then
  raise exception 'USERNAME_TAKEN';
end $$;

-- ============ v10: AthleteOrbit — trial notices, meet-day messages, meet ticketing ============
alter table public.profiles add column if not exists trial_notice text;
create table if not exists public.meetday_sent (
  meet_id uuid not null references public.meets(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  primary key (meet_id, day)
);
alter table public.meetday_sent enable row level security;

-- Meet ticketing. Listings are set up by the AthleteOrbit team with each meet organizer.
-- All ticket tables are read and written only by the server (service role); RLS on with no policies.
create table if not exists public.meet_listings (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) between 2 and 120),
  host text, location text, sport text default 'Gymnastics',
  start_date date not null, end_date date,
  sessions jsonb not null default '[]',          -- ["Session 1 · Sat 8:00 AM", ...]
  ticket_types jsonb not null default '[]',      -- [{"id":"adult","name":"Adult day pass","price":15}, ...]
  buyer_fee_cents int not null default 150 check (buyer_fee_cents between 0 and 2000),     -- service fee per ticket, kept by AthleteOrbit
  platform_pct numeric not null default 0 check (platform_pct between 0 and 30),            -- optional cut of ticket price
  organizer_name text, organizer_email text,
  stripe_account text,                           -- organizer's Stripe Connect account (payouts go there automatically)
  club_codes text[] not null default '{}',       -- gyms attending: their families get the link too
  status text not null default 'draft' check (status in ('draft','on_sale','closed')),
  door_key text not null default replace(gen_random_uuid()::text, '-', ''),
  notes text, notified_at timestamptz, created_at timestamptz not null default now()
);
create table if not exists public.ticket_orders (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.meet_listings(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  buyer_email text, buyer_name text,
  stripe_session text unique,
  tickets_cents int not null, fee_cents int not null, platform_cents int not null default 0,
  status text not null default 'paid' check (status in ('paid','refunded')),
  created_at timestamptz not null default now()
);
create table if not exists public.tickets (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.ticket_orders(id) on delete cascade,
  listing_id uuid not null references public.meet_listings(id) on delete cascade,
  type_name text not null, session_label text,
  code text not null unique,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create table if not exists public.listing_notices (
  listing_id uuid not null references public.meet_listings(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  primary key (listing_id, user_id)
);
alter table public.meet_listings enable row level security;
alter table public.ticket_orders enable row level security;
alter table public.tickets enable row level security;
alter table public.listing_notices enable row level security;
alter table public.meets add column if not exists listing_id uuid references public.meet_listings(id) on delete set null;

-- ============ v12: gym roster, season schedule per athlete, messages, announcement summaries ============
-- All new tables are read and written only by the server (service role): RLS on, no policies.
alter table public.gymnasts add column if not exists gender text check (gender in ('F','M'));
alter table public.gymnasts add column if not exists roster_id uuid;

create table if not exists public.club_roster (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  name text not null check (length(name) between 1 and 80),
  level text, program text, gender text check (gender in ('F','M')),
  sport text not null default 'Gymnastics',
  group_name text, parent_email text,
  created_at timestamptz not null default now()
);
create index if not exists club_roster_club on public.club_roster(club_id);
alter table public.club_roster enable row level security;

-- Competitions for a gym's season (read from a schedule photo or typed in). levels '{}' = every level; gender null = everyone.
create table if not exists public.club_meets (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  name text not null check (length(name) between 2 and 140),
  start_date date not null, end_date date,
  location text, host text, website text, venue text,
  sessions jsonb not null default '[]',          -- [{"levels":["Level 4"],"gender":"F","text":"Sat Jan 17 · Session 2 · 11:30 AM"}]
  levels text[] not null default '{}', gender text check (gender in ('F','M')),
  sport text not null default 'Gymnastics',
  status text not null default 'published' check (status in ('published','suggested')),
  notes text, info_source text, info_checked_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists club_meets_club on public.club_meets(club_id, start_date);
alter table public.club_meets enable row level security;

alter table public.meets add column if not exists club_meet_id uuid references public.club_meets(id) on delete set null;
alter table public.meets add column if not exists website text check (website is null or length(website) < 500);
alter table public.meets add column if not exists venue text;
alter table public.meets add column if not exists info_source text;
alter table public.meets add column if not exists info_checked_at timestamptz;

-- One conversation per family with their gym.
create table if not exists public.club_messages (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  family_id uuid not null references auth.users(id) on delete cascade,
  sender text not null check (sender in ('family','gym')),
  body text not null check (length(body) between 1 and 2000),
  read_by_family boolean not null default false,
  read_by_gym boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists club_messages_thread on public.club_messages(club_id, family_id, created_at);
alter table public.club_messages enable row level security;

alter table public.club_announcements add column if not exists summary text;

-- ---------- v13: organizers run their own ticketed events; meet photos & print orders; find-your-athlete requests ----------
alter table public.meet_listings add column if not exists owner_id uuid references auth.users(id) on delete set null;
alter table public.meet_listings add column if not exists updates jsonb not null default '[]';
create index if not exists meet_listings_owner on public.meet_listings(owner_id);
create table if not exists public.roster_requests (
  id uuid primary key default gen_random_uuid(),
  roster_id uuid not null references public.club_roster(id) on delete cascade,
  club_id uuid not null references public.clubs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','approved','declined')),
  created_at timestamptz not null default now()
);
create index if not exists roster_requests_club on public.roster_requests(club_id, status);
alter table public.roster_requests enable row level security;   -- server only
create index if not exists club_roster_name on public.club_roster(lower(name));

create table if not exists public.photos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  gymnast_id uuid references public.gymnasts(id) on delete cascade,
  meet_id uuid references public.meets(id) on delete set null,
  club_meet_id uuid references public.club_meets(id) on delete set null,
  path text not null unique, caption text, shared boolean not null default false,
  taken_at timestamp, width int, height int,
  created_at timestamptz not null default now()
);
create index if not exists photos_user on public.photos(user_id);
create index if not exists photos_club_meet on public.photos(club_meet_id) where shared;
alter table public.photos enable row level security;            -- server only (signed links)

create table if not exists public.print_orders (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  items jsonb not null, total_cents int not null,
  status text not null default 'pending' check (status in ('pending','sent','needs_attention','shipped','cancelled')),
  stripe_session text, lab_order_id text, problem text, paid_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.print_orders enable row level security;      -- server only

-- Private storage for photos and Season Book PDFs (Supabase Storage). Only the server hands out links.
do $$ begin
  if exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    insert into storage.buckets (id, name, public, file_size_limit) values ('photos', 'photos', false, 26214400) on conflict (id) do nothing;
  end if;
end $$;
