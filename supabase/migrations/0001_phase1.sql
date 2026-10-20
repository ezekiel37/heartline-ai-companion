-- Phase 1 schema. Every user-owned table cascades from auth.users, so
-- deleting the auth user hard-deletes all of their data (NDPA right to erasure).
-- Writes that affect billing, usage or safety go through the service role only.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- profiles
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  dob date,
  display_name text check (char_length(display_name) <= 40),
  language text not null default 'en' check (language in ('en', 'pcm')),
  age_confirmed_at timestamptz,
  blocked boolean not null default false,
  blocked_reason text,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
create policy "profiles: read own" on public.profiles for select using (auth.uid() = id);
-- Users may change only cosmetic fields; dob/blocked are set server-side.
revoke update on public.profiles from authenticated;
grant update (display_name, language) on public.profiles to authenticated;
create policy "profiles: update own" on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);

create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id) values (new.id) on conflict do nothing;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- -------------------------------------------------------------- characters
create table public.characters (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade, -- one partner per user (MVP)
  name text not null check (char_length(name) between 1 and 30),
  gender text not null check (gender in ('male', 'female')),
  personality text not null check (personality in ('caring', 'playful', 'calm', 'witty')),
  avatar_config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.characters enable row level security;
create policy "characters: read own" on public.characters for select using (auth.uid() = user_id);
create policy "characters: insert own" on public.characters for insert with check (auth.uid() = user_id);
create policy "characters: update own" on public.characters for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------------------------------------------------------------- messages
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  character_id uuid not null references public.characters(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null, -- AES-256-GCM encrypted by the app (enc:v1:...)
  model text,
  input_tokens integer,
  output_tokens integer,
  cache_read_tokens integer,
  cost_usd numeric(12, 6),
  flagged boolean not null default false,
  created_at timestamptz not null default now()
);

create index messages_character_created_idx on public.messages (character_id, created_at desc);
create index messages_user_created_idx on public.messages (user_id, created_at desc);

alter table public.messages enable row level security;
create policy "messages: read own" on public.messages for select using (auth.uid() = user_id);
-- No insert/update policy: only the chat API (service role) writes messages.

-- ------------------------------------------------------------------- usage
-- One row per user per day (Africa/Lagos). Serves both the free allowance and
-- the subscriber fair-use cap.
create table public.usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  usage_date date not null,
  messages_used integer not null default 0,
  primary key (user_id, usage_date)
);

alter table public.usage enable row level security;
create policy "usage: read own" on public.usage for select using (auth.uid() = user_id);

-- Atomic check-and-increment so parallel requests can't exceed the limit.
create function public.consume_message(p_user_id uuid, p_date date, p_limit integer)
returns table (allowed boolean, used integer)
language plpgsql security definer set search_path = public as $$
declare
  v_used integer;
begin
  if p_limit <= 0 then
    select u.messages_used into v_used from public.usage u where u.user_id = p_user_id and u.usage_date = p_date;
    return query select false, coalesce(v_used, 0);
    return;
  end if;

  insert into public.usage as u (user_id, usage_date, messages_used)
  values (p_user_id, p_date, 1)
  on conflict (user_id, usage_date) do update
    set messages_used = u.messages_used + 1
    where u.messages_used < p_limit
  returning u.messages_used into v_used;

  if v_used is null then
    select u.messages_used into v_used from public.usage u where u.user_id = p_user_id and u.usage_date = p_date;
    return query select false, coalesce(v_used, 0);
  else
    return query select true, v_used;
  end if;
end $$;

create function public.refund_message(p_user_id uuid, p_date date)
returns void language sql security definer set search_path = public as $$
  update public.usage set messages_used = greatest(messages_used - 1, 0)
  where user_id = p_user_id and usage_date = p_date;
$$;

revoke execute on function public.consume_message(uuid, date, integer) from public, anon, authenticated;
revoke execute on function public.refund_message(uuid, date) from public, anon, authenticated;
grant execute on function public.consume_message(uuid, date, integer) to service_role;
grant execute on function public.refund_message(uuid, date) to service_role;

-- ------------------------------------------------------------------- plans
create table public.plans (
  id text primary key,
  name text not null,
  price_kobo integer not null check (price_kobo > 0),
  duration_days integer not null check (duration_days > 0),
  billing text not null check (billing in ('pass', 'recurring')),
  paystack_plan_code text unique,
  daily_message_cap integer not null,
  features jsonb not null default '[]'::jsonb,
  active boolean not null default true,
  sort integer not null default 0
);

alter table public.plans enable row level security;
create policy "plans: public read active" on public.plans for select using (active);

insert into public.plans (id, name, price_kobo, duration_days, billing, daily_message_cap, features, active, sort) values
  ('two_week', '2 Weeks', 150000, 14, 'pass', 60,
    '["chat","memory","avatar_studio","wardrobe","gifts"]', true, 1),
  ('monthly', 'Monthly', 250000, 30, 'recurring', 100,
    '["chat","memory","avatar_studio","wardrobe","gifts","bonus_coins"]', true, 2),
  -- Turn these on after ~60 days of retention data (see README → Pricing).
  ('six_month', '6 Months', 1200000, 182, 'recurring', 120,
    '["chat","memory","avatar_studio","wardrobe","gifts","bonus_coins","exclusive_outfits"]', false, 3),
  ('yearly', 'Yearly', 2100000, 365, 'recurring', 120,
    '["chat","memory","avatar_studio","wardrobe","gifts","bonus_coins","exclusive_outfits","voice"]', false, 4);

-- ----------------------------------------------------------- subscriptions
create table public.subscriptions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  plan_id text not null references public.plans(id),
  status text not null check (status in ('active', 'past_due', 'cancelled')),
  current_period_end timestamptz,
  paystack_ref text,
  paystack_customer_code text,
  paystack_subscription_code text unique,
  paystack_email_token text,
  updated_at timestamptz not null default now()
);

create index subscriptions_customer_idx on public.subscriptions (paystack_customer_code);

alter table public.subscriptions enable row level security;
create policy "subscriptions: read own" on public.subscriptions for select using (auth.uid() = user_id);

-- Webhook idempotency: each payment reference is applied once.
create table public.payment_events (
  id bigserial primary key,
  event_key text not null unique,
  event text not null,
  received_at timestamptz not null default now()
);
alter table public.payment_events enable row level security;

-- ---------------------------------------------------------------- safety
-- Event type only; message content stays in the (encrypted) chat history.
create table public.safety_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null,
  created_at timestamptz not null default now()
);
alter table public.safety_events enable row level security;

create table public.message_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  message_id uuid not null references public.messages(id) on delete cascade,
  reason text not null check (char_length(reason) <= 500),
  created_at timestamptz not null default now(),
  unique (user_id, message_id)
);

alter table public.message_reports enable row level security;
create policy "reports: read own" on public.message_reports for select using (auth.uid() = user_id);
create policy "reports: insert own" on public.message_reports for insert with check (
  auth.uid() = user_id
  and exists (select 1 from public.messages m where m.id = message_id and m.user_id = auth.uid() and m.role = 'assistant')
);
