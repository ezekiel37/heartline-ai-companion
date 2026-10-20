-- Phase 2: memory, coins, wardrobe, gifts, payments ledger, admin metrics.
-- Same rules as Phase 1: user data cascades from auth.users, and anything
-- that moves money or coins is written by the service role only.

-- ---------------------------------------------------------------- memories
create table public.memories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  character_id uuid not null references public.characters(id) on delete cascade,
  fact text not null, -- encrypted by the app
  category text not null default 'other'
    check (category in ('identity', 'preference', 'person', 'event', 'goal', 'feeling', 'other')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index memories_character_idx on public.memories (character_id, updated_at desc);

alter table public.memories enable row level security;
create policy "memories: read own" on public.memories for select using (auth.uid() = user_id);
-- Users can make their partner forget something.
create policy "memories: delete own" on public.memories for delete using (auth.uid() = user_id);

-- Cost of background model calls (memory extraction etc.), so cost per user
-- includes more than chat replies.
create table public.llm_usage (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  purpose text not null,
  model text not null,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  cost_usd numeric(12, 6) not null default 0,
  created_at timestamptz not null default now()
);
create index llm_usage_created_idx on public.llm_usage (created_at desc);
alter table public.llm_usage enable row level security;

-- ------------------------------------------------------------------- plans
alter table public.plans add column bonus_coins integer not null default 0 check (bonus_coins >= 0);
update public.plans set bonus_coins = 150 where id = 'monthly';
update public.plans set bonus_coins = 1200 where id = 'six_month';
update public.plans set bonus_coins = 3000 where id = 'yearly';

-- ---------------------------------------------------------------- payments
-- Every successful charge, for revenue reporting and spend limits.
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  reference text not null unique,
  kind text not null check (kind in ('plan', 'coins')),
  item_id text not null, -- plan id or coin pack id
  amount_kobo integer not null check (amount_kobo > 0),
  created_at timestamptz not null default now()
);
create index payments_created_idx on public.payments (created_at desc);
create index payments_user_idx on public.payments (user_id, created_at desc);
alter table public.payments enable row level security;
create policy "payments: read own" on public.payments for select using (auth.uid() = user_id);

-- ------------------------------------------------------------------- coins
create table public.coin_packs (
  id text primary key,
  name text not null,
  coins integer not null check (coins > 0),
  price_kobo integer not null check (price_kobo > 0),
  active boolean not null default true,
  sort integer not null default 0
);
alter table public.coin_packs enable row level security;
create policy "coin_packs: public read active" on public.coin_packs for select using (active);

insert into public.coin_packs (id, name, coins, price_kobo, sort) values
  ('coins_100', '100 coins', 100, 50000, 1),
  ('coins_250', '250 coins', 250, 100000, 2),   -- 25% more per naira
  ('coins_700', '700 coins', 700, 250000, 3);   -- 40% more per naira

create table public.wallets (
  user_id uuid primary key references auth.users(id) on delete cascade,
  coin_balance integer not null default 0 check (coin_balance >= 0),
  updated_at timestamptz not null default now()
);
alter table public.wallets enable row level security;
create policy "wallets: read own" on public.wallets for select using (auth.uid() = user_id);

-- Append-only ledger. `ref` makes every credit/debit idempotent.
create table public.coin_transactions (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  delta integer not null,
  reason text not null,
  ref text not null unique,
  created_at timestamptz not null default now()
);
alter table public.coin_transactions enable row level security;
create policy "coin_transactions: read own" on public.coin_transactions for select using (auth.uid() = user_id);

-- ------------------------------------------------------- shop & inventory
create table public.shop_items (
  id text primary key,
  name text not null,
  category text not null check (category in ('top', 'bottom', 'dress', 'shoes', 'accessory', 'headwear')),
  gender text not null check (gender in ('male', 'female', 'any')),
  price_coins integer not null check (price_coins >= 0),
  exclusive boolean not null default false, -- gift/perk only, never for sale
  starter boolean not null default false,   -- everyone owns these
  active boolean not null default true
);
alter table public.shop_items enable row level security;
create policy "shop_items: public read" on public.shop_items for select using (active);

-- Generated from src/lib/avatar/catalog.ts.
insert into public.shop_items (id, name, category, gender, price_coins, exclusive, starter) values
  ('basic_tee_rose', 'Rose tee', 'top', 'any', 0, false, true),
  ('basic_tee_navy', 'Navy tee', 'top', 'any', 0, false, true),
  ('basic_jeans', 'Blue jeans', 'bottom', 'any', 0, false, true),
  ('basic_sneakers', 'White sneakers', 'shoes', 'any', 0, false, true),
  ('shirt_white', 'Crisp white shirt', 'top', 'any', 60, false, false),
  ('hoodie_mustard', 'Mustard hoodie', 'top', 'any', 80, false, false),
  ('kaftan_wine', 'Wine kaftan', 'top', 'male', 150, false, false),
  ('kaftan_ankara', 'Ankara kaftan', 'top', 'male', 180, false, false),
  ('blouse_ankara', 'Ankara blouse', 'top', 'female', 120, false, false),
  ('blouse_lilac', 'Lilac blouse', 'top', 'female', 70, false, false),
  ('trousers_black', 'Black trousers', 'bottom', 'any', 60, false, false),
  ('trousers_cream', 'Cream chinos', 'bottom', 'any', 60, false, false),
  ('shorts_khaki', 'Khaki shorts', 'bottom', 'any', 40, false, false),
  ('skirt_pleated', 'Pleated skirt', 'bottom', 'female', 70, false, false),
  ('skirt_ankara', 'Ankara skirt', 'bottom', 'female', 110, false, false),
  ('dress_red', 'Red date-night dress', 'dress', 'female', 160, false, false),
  ('dress_ankara', 'Ankara dress', 'dress', 'female', 200, false, false),
  ('gown_emerald', 'Emerald gown', 'dress', 'female', 260, false, false),
  ('sneakers_black', 'Black sneakers', 'shoes', 'any', 50, false, false),
  ('heels_nude', 'Nude heels', 'shoes', 'female', 80, false, false),
  ('sandals_brown', 'Leather sandals', 'shoes', 'any', 50, false, false),
  ('glasses_round', 'Round glasses', 'accessory', 'any', 40, false, false),
  ('necklace_gold', 'Gold chain', 'accessory', 'any', 90, false, false),
  ('earrings_hoops', 'Gold hoops', 'accessory', 'female', 60, false, false),
  ('cap_black', 'Black cap', 'headwear', 'any', 40, false, false),
  ('fila_wine', 'Wine fila cap', 'headwear', 'male', 70, false, false),
  ('gele_gold', 'Gold gele', 'headwear', 'female', 140, false, false),
  ('gift_birthday_gown', 'Birthday gown', 'dress', 'female', 0, true, false),
  ('gift_birthday_agbada', 'Birthday kaftan', 'top', 'male', 0, true, false),
  ('gift_streak_hoodie', '30-day streak hoodie', 'top', 'any', 0, true, false),
  ('gift_anniversary_necklace', 'Anniversary necklace', 'accessory', 'any', 0, true, false);

create table public.inventory (
  user_id uuid not null references auth.users(id) on delete cascade,
  item_id text not null references public.shop_items(id),
  acquired_via text not null check (acquired_via in ('purchase', 'gift')),
  acquired_at timestamptz not null default now(),
  primary key (user_id, item_id)
);
alter table public.inventory enable row level security;
create policy "inventory: read own" on public.inventory for select using (auth.uid() = user_id);

-- ------------------------------------------------------------------- gifts
create table public.gifts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  character_id uuid not null references public.characters(id) on delete cascade,
  kind text not null check (kind in ('card', 'flowers', 'outfit', 'coins')),
  item_id text references public.shop_items(id),
  coins integer,
  message text not null,
  trigger_key text not null,
  sent_at timestamptz not null default now(),
  opened boolean not null default false,
  unique (user_id, trigger_key)
);
create index gifts_user_sent_idx on public.gifts (user_id, sent_at desc);
alter table public.gifts enable row level security;
create policy "gifts: read own" on public.gifts for select using (auth.uid() = user_id);
revoke update on public.gifts from authenticated;
grant update (opened) on public.gifts to authenticated;
create policy "gifts: open own" on public.gifts for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Avatar edits go through the API (ownership + plan checks), not direct updates.
revoke update on public.characters from authenticated;
grant update (name) on public.characters to authenticated;

-- ---------------------------------------------------------------- functions
create function public.credit_coins(p_user_id uuid, p_amount integer, p_reason text, p_ref text)
returns table (applied boolean, balance integer)
language plpgsql security definer set search_path = public as $$
declare
  v_balance integer;
begin
  if p_amount <= 0 then
    raise exception 'credit amount must be positive';
  end if;

  insert into public.coin_transactions (user_id, delta, reason, ref)
  values (p_user_id, p_amount, p_reason, p_ref)
  on conflict (ref) do nothing;

  if not found then
    select w.coin_balance into v_balance from public.wallets w where w.user_id = p_user_id;
    return query select false, coalesce(v_balance, 0);
    return;
  end if;

  insert into public.wallets as w (user_id, coin_balance) values (p_user_id, p_amount)
  on conflict (user_id) do update set coin_balance = w.coin_balance + p_amount, updated_at = now()
  returning w.coin_balance into v_balance;

  return query select true, v_balance;
end $$;

create function public.purchase_item(p_user_id uuid, p_item_id text)
returns table (ok boolean, reason text, balance integer)
language plpgsql security definer set search_path = public as $$
declare
  v_price integer;
  v_balance integer;
begin
  select i.price_coins into v_price from public.shop_items i
  where i.id = p_item_id and i.active and not i.exclusive and not i.starter and i.price_coins > 0;
  if v_price is null then
    return query select false, 'not_for_sale'::text, null::integer;
    return;
  end if;

  -- Lock the wallet first so concurrent purchases serialise.
  insert into public.wallets (user_id) values (p_user_id) on conflict do nothing;
  select w.coin_balance into v_balance from public.wallets w where w.user_id = p_user_id for update;

  if exists (select 1 from public.inventory v where v.user_id = p_user_id and v.item_id = p_item_id) then
    return query select false, 'owned'::text, v_balance;
    return;
  end if;
  if v_balance < v_price then
    return query select false, 'insufficient'::text, v_balance;
    return;
  end if;

  update public.wallets w set coin_balance = w.coin_balance - v_price, updated_at = now()
  where w.user_id = p_user_id returning w.coin_balance into v_balance;
  insert into public.coin_transactions (user_id, delta, reason, ref)
  values (p_user_id, -v_price, 'purchase:' || p_item_id, 'buy:' || p_user_id || ':' || p_item_id);
  insert into public.inventory (user_id, item_id, acquired_via) values (p_user_id, p_item_id, 'purchase');

  return query select true, 'ok'::text, v_balance;
end $$;

create function public.admin_metrics() returns jsonb
language sql stable security definer set search_path = public as $$
  with
    today as (select (now() at time zone 'Africa/Lagos')::date as d),
    paying as (
      select user_id, plan_id from public.subscriptions
      where status <> 'past_due' and current_period_end > now()
    ),
    replies as (
      select user_id, cost_usd from public.messages
      where role = 'assistant' and created_at > now() - interval '30 days'
    ),
    costs as (
      select user_id, cost_usd from replies
      union all
      select user_id, cost_usd from public.llm_usage where created_at > now() - interval '30 days'
    )
  select jsonb_build_object(
    'users_total', (select count(*) from public.profiles where not blocked),
    'users_new_7d', (select count(*) from public.profiles where created_at > now() - interval '7 days'),
    'dau', (select count(*) from public.usage, today where usage_date = today.d and messages_used > 0),
    'wau', (select count(distinct user_id) from public.usage, today where usage_date > today.d - 7 and messages_used > 0),
    'paying_active', (select count(*) from paying),
    'paying_by_plan', (select coalesce(jsonb_object_agg(plan_id, n), '{}'::jsonb)
                       from (select plan_id, count(*) as n from paying group by plan_id) p),
    'revenue_30d_kobo', (select coalesce(sum(amount_kobo), 0) from public.payments where created_at > now() - interval '30 days'),
    'revenue_30d_by_kind', (select coalesce(jsonb_object_agg(kind, total), '{}'::jsonb)
                            from (select kind, sum(amount_kobo) as total from public.payments
                                  where created_at > now() - interval '30 days' group by kind) r),
    'replies_30d', (select count(*) from replies),
    'llm_cost_30d_usd', (select coalesce(sum(cost_usd), 0) from costs),
    'llm_cost_30d_paying_usd', (select coalesce(sum(cost_usd), 0) from costs where user_id in (select user_id from paying)),
    'llm_cost_30d_background_usd', (select coalesce(sum(cost_usd), 0) from public.llm_usage where created_at > now() - interval '30 days'),
    'top_cost_users', (select coalesce(jsonb_agg(t), '[]'::jsonb) from (
        select c.user_id, round(sum(c.cost_usd), 4) as usd,
               (select count(*) from replies r where r.user_id = c.user_id) as replies,
               exists (select 1 from paying p where p.user_id = c.user_id) as paying
        from costs c group by c.user_id order by sum(c.cost_usd) desc nulls last limit 10) t),
    'safety_7d', (select coalesce(jsonb_object_agg(type, n), '{}'::jsonb)
                  from (select type, count(*) as n from public.safety_events
                        where created_at > now() - interval '7 days' group by type) s),
    'reports_7d', (select count(*) from public.message_reports where created_at > now() - interval '7 days'),
    'coins_outstanding', (select coalesce(sum(coin_balance), 0) from public.wallets)
  );
$$;

revoke execute on function public.credit_coins(uuid, integer, text, text) from public, anon, authenticated;
revoke execute on function public.purchase_item(uuid, text) from public, anon, authenticated;
revoke execute on function public.admin_metrics() from public, anon, authenticated;
grant execute on function public.credit_coins(uuid, integer, text, text) to service_role;
grant execute on function public.purchase_item(uuid, text) to service_role;
grant execute on function public.admin_metrics() to service_role;
