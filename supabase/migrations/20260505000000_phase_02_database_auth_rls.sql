create extension if not exists pgcrypto with schema extensions;

do $$
begin
  create type public.app_role as enum ('user', 'admin');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.profile_status as enum ('active', 'deleted');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.stock_support_status as enum ('supported', 'unsupported');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.account_type as enum ('nisa', 'tokutei', 'general');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.dividend_event_type as enum ('interim', 'year_end', 'special', 'commemorative', 'other');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.dividend_event_status as enum ('estimated', 'confirmed', 'paid', 'undecided');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.dividend_change_type as enum ('increase', 'decrease', 'no_dividend', 'resumed', 'special', 'commemorative', 'unchanged');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.review_status as enum ('pending', 'approved', 'rejected');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.notification_rule_basis as enum ('before_tax_yield', 'after_tax_yield');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.notification_operator as enum ('gte', 'lte');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.notification_rule_status as enum ('active', 'disabled');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.notification_type as enum ('yield_target', 'dividend_increase', 'dividend_decrease', 'no_dividend', 'special_dividend', 'data_update');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.notification_status as enum ('unread', 'read', 'failed');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.notification_channel as enum ('in_app', 'email');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.amount_basis as enum ('before_tax', 'after_tax');
exception when duplicate_object then null;
end $$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  role public.app_role not null default 'user',
  status public.profile_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_settings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  email_notification_enabled boolean not null default true,
  in_app_notification_enabled boolean not null default true,
  default_amount_basis public.amount_basis not null default 'after_tax',
  currency text not null default 'JPY',
  monthly_dividend_goal_amount numeric(18,2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id)
);

create table if not exists public.stocks (
  id uuid primary key default gen_random_uuid(),
  ticker text not null unique,
  exchange text not null default 'TSE',
  name text not null,
  name_en text,
  currency text not null default 'JPY',
  support_status public.stock_support_status not null default 'unsupported',
  current_price numeric(18,2),
  price_updated_at timestamptz,
  expected_annual_dividend_per_share numeric(18,2),
  expected_dividend_yield numeric(8,4),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.holdings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  stock_id uuid not null references public.stocks(id),
  quantity numeric(18,4) not null check (quantity > 0),
  average_purchase_price numeric(18,2) not null check (average_purchase_price >= 0),
  account_type public.account_type not null,
  memo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.dividend_events (
  id uuid primary key default gen_random_uuid(),
  stock_id uuid not null references public.stocks(id),
  fiscal_year int not null,
  event_type public.dividend_event_type not null,
  dividend_per_share numeric(18,2),
  previous_dividend_per_share numeric(18,2),
  expected_payment_date date,
  expected_payment_month int check (expected_payment_month between 1 and 12),
  record_date date,
  ex_dividend_date date,
  status public.dividend_event_status not null default 'estimated',
  change_type public.dividend_change_type,
  source_type text,
  source_url text,
  source_published_at timestamptz,
  review_status public.review_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint dividend_events_undecided_amount_check
    check (status <> 'undecided' or dividend_per_share is null)
);

create table if not exists public.notification_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  stock_id uuid not null references public.stocks(id),
  basis public.notification_rule_basis not null,
  operator public.notification_operator not null,
  target_yield numeric(8,4) not null check (target_yield > 0),
  notify_in_app boolean not null default true,
  notify_email boolean not null default false,
  status public.notification_rule_status not null default 'active',
  last_triggered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  stock_id uuid references public.stocks(id),
  notification_rule_id uuid references public.notification_rules(id),
  type public.notification_type not null,
  title text not null,
  body text not null,
  payload jsonb not null default '{}',
  status public.notification_status not null default 'unread',
  channel public.notification_channel not null default 'in_app',
  sent_at timestamptz,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists set_user_settings_updated_at on public.user_settings;
create trigger set_user_settings_updated_at
before update on public.user_settings
for each row execute function public.set_updated_at();

drop trigger if exists set_stocks_updated_at on public.stocks;
create trigger set_stocks_updated_at
before update on public.stocks
for each row execute function public.set_updated_at();

drop trigger if exists set_holdings_updated_at on public.holdings;
create trigger set_holdings_updated_at
before update on public.holdings
for each row execute function public.set_updated_at();

drop trigger if exists set_dividend_events_updated_at on public.dividend_events;
create trigger set_dividend_events_updated_at
before update on public.dividend_events
for each row execute function public.set_updated_at();

drop trigger if exists set_notification_rules_updated_at on public.notification_rules;
create trigger set_notification_rules_updated_at
before update on public.notification_rules
for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, coalesce(new.email, ''))
  on conflict (id) do update set email = excluded.email;

  insert into public.user_settings (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'admin'
      and status = 'active'
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

alter table public.profiles enable row level security;
alter table public.user_settings enable row level security;
alter table public.stocks enable row level security;
alter table public.holdings enable row level security;
alter table public.dividend_events enable row level security;
alter table public.notification_rules enable row level security;
alter table public.notifications enable row level security;

drop policy if exists "Users can view own profile" on public.profiles;
create policy "Users can view own profile"
on public.profiles for select
to authenticated
using ((select auth.uid()) = id);

drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile"
on public.profiles for update
to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

drop policy if exists "Users can view own settings" on public.user_settings;
create policy "Users can view own settings"
on public.user_settings for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Users can update own settings" on public.user_settings;
create policy "Users can update own settings"
on public.user_settings for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "Authenticated users can view stocks" on public.stocks;
create policy "Authenticated users can view stocks"
on public.stocks for select
to authenticated
using (true);

drop policy if exists "Admins can manage stocks" on public.stocks;
create policy "Admins can manage stocks"
on public.stocks for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Users can view own holdings" on public.holdings;
create policy "Users can view own holdings"
on public.holdings for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Users can insert own holdings" on public.holdings;
create policy "Users can insert own holdings"
on public.holdings for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update own holdings" on public.holdings;
create policy "Users can update own holdings"
on public.holdings for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "Authenticated users can view approved dividend events" on public.dividend_events;
create policy "Authenticated users can view approved dividend events"
on public.dividend_events for select
to authenticated
using (review_status = 'approved');

drop policy if exists "Admins can manage dividend events" on public.dividend_events;
create policy "Admins can manage dividend events"
on public.dividend_events for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Users can view own notification rules" on public.notification_rules;
create policy "Users can view own notification rules"
on public.notification_rules for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Users can insert own notification rules" on public.notification_rules;
create policy "Users can insert own notification rules"
on public.notification_rules for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update own notification rules" on public.notification_rules;
create policy "Users can update own notification rules"
on public.notification_rules for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can view own notifications" on public.notifications;
create policy "Users can view own notifications"
on public.notifications for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Users can update own notifications" on public.notifications;
create policy "Users can update own notifications"
on public.notifications for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

revoke all on public.profiles from authenticated;
grant select on public.profiles to authenticated;
grant update(email) on public.profiles to authenticated;

revoke all on public.user_settings from authenticated;
grant select, update on public.user_settings to authenticated;

revoke all on public.stocks from authenticated;
grant select, insert, update, delete on public.stocks to authenticated;

revoke all on public.holdings from authenticated;
grant select, insert, update on public.holdings to authenticated;

revoke all on public.dividend_events from authenticated;
grant select, insert, update, delete on public.dividend_events to authenticated;

revoke all on public.notification_rules from authenticated;
grant select, insert, update on public.notification_rules to authenticated;

revoke all on public.notifications from authenticated;
grant select on public.notifications to authenticated;
grant update(status, read_at) on public.notifications to authenticated;

create index if not exists idx_stocks_ticker on public.stocks(ticker);
create index if not exists idx_stocks_name on public.stocks(name);
create index if not exists idx_stocks_support_status on public.stocks(support_status);
create index if not exists idx_holdings_user_id on public.holdings(user_id);
create index if not exists idx_holdings_user_stock on public.holdings(user_id, stock_id);
create index if not exists idx_dividend_events_stock_year on public.dividend_events(stock_id, fiscal_year);
create index if not exists idx_dividend_events_payment_month on public.dividend_events(fiscal_year, expected_payment_month);
create index if not exists idx_dividend_events_review_status on public.dividend_events(review_status);
create index if not exists idx_notification_rules_user_id on public.notification_rules(user_id);
create index if not exists idx_notification_rules_status on public.notification_rules(status);
create index if not exists idx_notifications_user_created on public.notifications(user_id, created_at desc);
create index if not exists idx_notifications_user_status on public.notifications(user_id, status);

insert into public.stocks (
  ticker,
  exchange,
  name,
  name_en,
  support_status,
  current_price,
  expected_annual_dividend_per_share,
  expected_dividend_yield
) values
  ('1605', 'TSE', 'INPEX', 'INPEX Corporation', 'supported', 2080, 86, 4.1346),
  ('1928', 'TSE', '積水ハウス', 'Sekisui House', 'supported', 3610, 129, 3.5734),
  ('2914', 'TSE', '日本たばこ産業', 'Japan Tobacco', 'supported', 3800, 194, 5.1053),
  ('3003', 'TSE', 'ヒューリック', 'Hulic', 'supported', 1500, 54, 3.6000),
  ('3407', 'TSE', '旭化成', 'Asahi Kasei', 'supported', 1070, 36, 3.3645),
  ('4063', 'TSE', '信越化学工業', 'Shin-Etsu Chemical', 'supported', 6000, 100, 1.6667),
  ('4502', 'TSE', '武田薬品工業', 'Takeda Pharmaceutical', 'supported', 4200, 188, 4.4762),
  ('5020', 'TSE', 'ENEOSホールディングス', 'ENEOS Holdings', 'supported', 790, 22, 2.7848),
  ('5108', 'TSE', 'ブリヂストン', 'Bridgestone', 'supported', 6100, 210, 3.4426),
  ('5401', 'TSE', '日本製鉄', 'Nippon Steel', 'supported', 3400, 160, 4.7059),
  ('6301', 'TSE', '小松製作所', 'Komatsu', 'supported', 4500, 167, 3.7111),
  ('7203', 'TSE', 'トヨタ自動車', 'Toyota Motor', 'supported', 3000, 75, 2.5000),
  ('7267', 'TSE', '本田技研工業', 'Honda Motor', 'supported', 1650, 68, 4.1212),
  ('7751', 'TSE', 'キヤノン', 'Canon', 'supported', 4500, 150, 3.3333),
  ('8053', 'TSE', '住友商事', 'Sumitomo Corporation', 'supported', 3500, 125, 3.5714),
  ('8058', 'TSE', '三菱商事', 'Mitsubishi Corporation', 'supported', 3100, 100, 3.2258),
  ('8306', 'TSE', '三菱UFJフィナンシャル・グループ', 'Mitsubishi UFJ Financial Group', 'supported', 1550, 50, 3.2258),
  ('8316', 'TSE', '三井住友フィナンシャルグループ', 'Sumitomo Mitsui Financial Group', 'supported', 9800, 330, 3.3673),
  ('8411', 'TSE', 'みずほフィナンシャルグループ', 'Mizuho Financial Group', 'supported', 3200, 105, 3.2813),
  ('8591', 'TSE', 'オリックス', 'ORIX', 'supported', 3300, 98.6, 2.9879),
  ('8766', 'TSE', '東京海上ホールディングス', 'Tokio Marine Holdings', 'supported', 5200, 162, 3.1154),
  ('8905', 'TSE', 'イオンモール', 'AEON Mall', 'supported', 1900, 50, 2.6316),
  ('9432', 'TSE', '日本電信電話', 'Nippon Telegraph and Telephone', 'supported', 170, 5.2, 3.0588),
  ('9433', 'TSE', 'KDDI', 'KDDI Corporation', 'supported', 4300, 150, 3.4884),
  ('9434', 'TSE', 'ソフトバンク', 'SoftBank Corp.', 'supported', 1950, 86, 4.4103),
  ('9503', 'TSE', '関西電力', 'Kansai Electric Power', 'supported', 2500, 60, 2.4000),
  ('9513', 'TSE', '電源開発', 'Electric Power Development', 'supported', 2500, 90, 3.6000),
  ('8309', 'TSE', '三井住友トラスト・グループ', 'Sumitomo Mitsui Trust Group', 'supported', 3500, 130, 3.7143),
  ('8725', 'TSE', 'MS&ADインシュアランスグループ', 'MS&AD Insurance Group', 'supported', 3400, 145, 4.2647),
  ('8795', 'TSE', 'T&Dホールディングス', 'T&D Holdings', 'supported', 2600, 90, 3.4615),
  ('1878', 'TSE', '大東建託', 'Daito Trust Construction', 'supported', 16700, 560, 3.3533),
  ('4523', 'TSE', 'エーザイ', 'Eisai', 'unsupported', 6200, 160, 2.5806),
  ('6501', 'TSE', '日立製作所', 'Hitachi', 'unsupported', 3600, 35, 0.9722),
  ('6758', 'TSE', 'ソニーグループ', 'Sony Group', 'unsupported', 13500, 90, 0.6667),
  ('9984', 'TSE', 'ソフトバンクグループ', 'SoftBank Group', 'unsupported', 8800, 44, 0.5000)
on conflict (ticker) do update set
  exchange = excluded.exchange,
  name = excluded.name,
  name_en = excluded.name_en,
  support_status = excluded.support_status,
  current_price = excluded.current_price,
  expected_annual_dividend_per_share = excluded.expected_annual_dividend_per_share,
  expected_dividend_yield = excluded.expected_dividend_yield,
  updated_at = now();
