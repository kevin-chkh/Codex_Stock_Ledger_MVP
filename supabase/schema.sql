create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  created_at timestamptz not null default now()
);

create table if not exists public.portfolios (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  currency text not null default 'TWD',
  initial_amount numeric(18, 2) not null default 0,
  cash_balance numeric(18, 2) not null default 0,
  total_deposits numeric(18, 2) not null default 0,
  total_withdrawals numeric(18, 2) not null default 0,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.cash_movements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  portfolio_id uuid not null references public.portfolios(id) on delete cascade,
  type text not null check (type in ('deposit', 'withdraw', 'adjust')),
  amount numeric(18, 2) not null check (amount > 0),
  balance_after numeric(18, 2) not null,
  occurred_at date not null default current_date,
  note text
);

create table if not exists public.stocks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  symbol text not null,
  name text not null,
  market text not null default 'TWSE',
  industry text,
  current_price numeric(18, 2) not null default 0,
  price_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, market, symbol)
);

create table if not exists public.stock_tags (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  stock_id uuid not null references public.stocks(id) on delete cascade,
  name text not null,
  unique (user_id, stock_id, name)
);

create table if not exists public.trades (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  portfolio_id uuid not null references public.portfolios(id) on delete cascade,
  stock_id uuid not null references public.stocks(id) on delete restrict,
  type text not null check (type in ('buy', 'sell')),
  traded_at date not null default current_date,
  quantity numeric(18, 4) not null check (quantity > 0),
  unit_price numeric(18, 4) not null check (unit_price > 0),
  gross_amount numeric(18, 2) not null,
  fee numeric(18, 2) not null default 0,
  tax numeric(18, 2) not null default 0,
  net_amount numeric(18, 2) not null,
  note text,
  created_at timestamptz not null default now()
);

create table if not exists public.position_adjustments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  portfolio_id uuid not null references public.portfolios(id) on delete cascade,
  stock_id uuid not null references public.stocks(id) on delete cascade,
  adjusted_quantity numeric(18, 4) not null default 0 check (adjusted_quantity >= 0),
  adjusted_cost numeric(18, 2) not null default 0 check (adjusted_cost >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, portfolio_id, stock_id)
);

create table if not exists public.settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  fee_rate numeric(10, 8) not null default 0.0012825,
  tax_rate numeric(10, 8) not null default 0.003,
  minimum_fee numeric(18, 2) not null default 0,
  allow_negative_cash boolean not null default false
);

alter table public.profiles enable row level security;
alter table public.portfolios enable row level security;
alter table public.cash_movements enable row level security;
alter table public.stocks enable row level security;
alter table public.stock_tags enable row level security;
alter table public.trades enable row level security;
alter table public.position_adjustments enable row level security;
alter table public.settings enable row level security;

alter table public.settings
alter column fee_rate set default 0.0012825;

update public.settings
set fee_rate = 0.0012825
where fee_rate = 0.001425;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'position_adjustments_user_id_portfolio_id_stock_id_key'
  ) then
    alter table public.position_adjustments
    add constraint position_adjustments_user_id_portfolio_id_stock_id_key
    unique (user_id, portfolio_id, stock_id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'profiles' and policyname = 'profiles own rows'
  ) then
    create policy "profiles own rows" on public.profiles
      for all using (auth.uid() = id) with check (auth.uid() = id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'portfolios' and policyname = 'portfolios own rows'
  ) then
    create policy "portfolios own rows" on public.portfolios
      for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'cash_movements' and policyname = 'cash movements own rows'
  ) then
    create policy "cash movements own rows" on public.cash_movements
      for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'stocks' and policyname = 'stocks own rows'
  ) then
    create policy "stocks own rows" on public.stocks
      for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'stock_tags' and policyname = 'stock tags own rows'
  ) then
    create policy "stock tags own rows" on public.stock_tags
      for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'trades' and policyname = 'trades own rows'
  ) then
    create policy "trades own rows" on public.trades
      for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'position_adjustments' and policyname = 'position adjustments own rows'
  ) then
    create policy "position adjustments own rows" on public.position_adjustments
      for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'settings' and policyname = 'settings own rows'
  ) then
    create policy "settings own rows" on public.settings
      for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
end $$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;

  insert into public.settings (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();
