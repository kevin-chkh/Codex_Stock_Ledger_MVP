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
  portfolio_id uuid references public.portfolios(id) on delete cascade,
  stock_id uuid not null references public.stocks(id) on delete cascade,
  name text not null,
  unique (user_id, portfolio_id, stock_id, name)
);

create table if not exists public.portfolio_stock_overrides (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  portfolio_id uuid not null references public.portfolios(id) on delete cascade,
  stock_id uuid not null references public.stocks(id) on delete cascade,
  industry_override text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, portfolio_id, stock_id)
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
  baseline_traded_at date,
  baseline_created_at timestamptz,
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
alter table public.portfolio_stock_overrides enable row level security;
alter table public.trades enable row level security;
alter table public.position_adjustments enable row level security;
alter table public.settings enable row level security;

alter table public.settings
alter column fee_rate set default 0.0012825;

update public.settings
set fee_rate = 0.0012825
where fee_rate = 0.001425;

alter table public.position_adjustments
add column if not exists baseline_traded_at date;

alter table public.position_adjustments
add column if not exists baseline_created_at timestamptz;

alter table public.stock_tags
add column if not exists portfolio_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'stock_tags_portfolio_id_fkey'
  ) then
    alter table public.stock_tags
    add constraint stock_tags_portfolio_id_fkey
    foreign key (portfolio_id) references public.portfolios(id) on delete cascade;
  end if;
end $$;

update public.position_adjustments
set
  baseline_traded_at = coalesce(baseline_traded_at, created_at::date, current_date),
  baseline_created_at = coalesce(baseline_created_at, updated_at, created_at, now())
where baseline_traded_at is null
   or baseline_created_at is null;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'stock_tags_user_id_stock_id_name_key'
  ) then
    alter table public.stock_tags
    drop constraint stock_tags_user_id_stock_id_name_key;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'stock_tags_user_id_portfolio_id_stock_id_name_key'
  ) then
    alter table public.stock_tags
    add constraint stock_tags_user_id_portfolio_id_stock_id_name_key
    unique (user_id, portfolio_id, stock_id, name);
  end if;

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
    where schemaname = 'public' and tablename = 'portfolio_stock_overrides' and policyname = 'portfolio stock overrides own rows'
  ) then
    create policy "portfolio stock overrides own rows" on public.portfolio_stock_overrides
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

create or replace function public.delete_trade_transaction(p_trade_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  target_trade public.trades%rowtype;
  cash_delta numeric(18, 2);
begin
  select *
  into target_trade
  from public.trades
  where id = p_trade_id
    and user_id = auth.uid()
  for update;

  if not found then
    raise exception 'trade_not_found'
      using errcode = 'P0002';
  end if;

  perform 1
  from public.portfolios
  where id = target_trade.portfolio_id
    and user_id = auth.uid()
  for update;

  if not found then
    raise exception 'portfolio_not_found'
      using errcode = 'P0002';
  end if;

  cash_delta := case
    when target_trade.type = 'buy' then target_trade.net_amount
    else -target_trade.net_amount
  end;

  update public.portfolios
  set
    cash_balance = cash_balance + cash_delta,
    updated_at = now()
  where id = target_trade.portfolio_id
    and user_id = auth.uid();

  delete from public.trades
  where id = target_trade.id
    and user_id = auth.uid();
end;
$$;

create or replace function public.save_trade_transaction(
  p_stock jsonb,
  p_trade jsonb,
  p_tag_names text[],
  p_industry_override text,
  p_portfolio_updates jsonb
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  target_stock_id uuid := (p_stock ->> 'id')::uuid;
  target_trade_id uuid := (p_trade ->> 'id')::uuid;
  target_portfolio_id uuid := (p_trade ->> 'portfolio_id')::uuid;
  portfolio_update jsonb;
  tag_name text;
begin
  if (p_stock ->> 'user_id')::uuid <> auth.uid()
    or (p_trade ->> 'user_id')::uuid <> auth.uid() then
    raise exception 'permission_denied'
      using errcode = '42501';
  end if;

  perform 1
  from public.portfolios
  where id = target_portfolio_id
    and user_id = auth.uid()
  for update;

  if not found then
    raise exception 'portfolio_not_found'
      using errcode = 'P0002';
  end if;

  if exists (
    select 1
    from public.stocks
    where id = target_stock_id
      and user_id = auth.uid()
  ) then
    update public.stocks
    set
      name = p_stock ->> 'name',
      market = coalesce(nullif(p_stock ->> 'market', ''), market),
      industry = nullif(p_stock ->> 'industry', ''),
      current_price = coalesce((p_stock ->> 'current_price')::numeric, current_price),
      price_updated_at = nullif(p_stock ->> 'price_updated_at', '')::timestamptz,
      updated_at = coalesce(nullif(p_stock ->> 'updated_at', '')::timestamptz, now())
    where id = target_stock_id
      and user_id = auth.uid();
  else
    insert into public.stocks (
      id,
      user_id,
      symbol,
      name,
      market,
      industry,
      current_price,
      price_updated_at,
      created_at,
      updated_at
    )
    values (
      target_stock_id,
      auth.uid(),
      p_stock ->> 'symbol',
      p_stock ->> 'name',
      coalesce(nullif(p_stock ->> 'market', ''), 'TWSE'),
      nullif(p_stock ->> 'industry', ''),
      coalesce((p_stock ->> 'current_price')::numeric, 0),
      nullif(p_stock ->> 'price_updated_at', '')::timestamptz,
      coalesce(nullif(p_stock ->> 'created_at', '')::timestamptz, now()),
      coalesce(nullif(p_stock ->> 'updated_at', '')::timestamptz, now())
    );
  end if;

  if exists (
    select 1
    from public.trades
    where id = target_trade_id
      and user_id = auth.uid()
  ) then
    update public.trades
    set
      portfolio_id = target_portfolio_id,
      stock_id = target_stock_id,
      type = p_trade ->> 'type',
      traded_at = (p_trade ->> 'traded_at')::date,
      quantity = (p_trade ->> 'quantity')::numeric,
      unit_price = (p_trade ->> 'unit_price')::numeric,
      gross_amount = (p_trade ->> 'gross_amount')::numeric,
      fee = (p_trade ->> 'fee')::numeric,
      tax = (p_trade ->> 'tax')::numeric,
      net_amount = (p_trade ->> 'net_amount')::numeric,
      note = nullif(p_trade ->> 'note', '')
    where id = target_trade_id
      and user_id = auth.uid();
  else
    insert into public.trades (
      id,
      user_id,
      portfolio_id,
      stock_id,
      type,
      traded_at,
      quantity,
      unit_price,
      gross_amount,
      fee,
      tax,
      net_amount,
      note,
      created_at
    )
    values (
      target_trade_id,
      auth.uid(),
      target_portfolio_id,
      target_stock_id,
      p_trade ->> 'type',
      (p_trade ->> 'traded_at')::date,
      (p_trade ->> 'quantity')::numeric,
      (p_trade ->> 'unit_price')::numeric,
      (p_trade ->> 'gross_amount')::numeric,
      (p_trade ->> 'fee')::numeric,
      (p_trade ->> 'tax')::numeric,
      (p_trade ->> 'net_amount')::numeric,
      nullif(p_trade ->> 'note', ''),
      coalesce(nullif(p_trade ->> 'created_at', '')::timestamptz, now())
    );
  end if;

  delete from public.stock_tags
  where stock_id = target_stock_id
    and portfolio_id = target_portfolio_id
    and user_id = auth.uid();

  foreach tag_name in array coalesce(p_tag_names, array[]::text[]) loop
    if nullif(trim(tag_name), '') is not null then
      insert into public.stock_tags (user_id, portfolio_id, stock_id, name)
      values (auth.uid(), target_portfolio_id, target_stock_id, trim(tag_name))
      on conflict (user_id, portfolio_id, stock_id, name) do nothing;
    end if;
  end loop;

  if nullif(trim(coalesce(p_industry_override, '')), '') is null then
    delete from public.portfolio_stock_overrides
    where user_id = auth.uid()
      and portfolio_id = target_portfolio_id
      and stock_id = target_stock_id;
  else
    insert into public.portfolio_stock_overrides (
      user_id,
      portfolio_id,
      stock_id,
      industry_override
    )
    values (
      auth.uid(),
      target_portfolio_id,
      target_stock_id,
      trim(p_industry_override)
    )
    on conflict (user_id, portfolio_id, stock_id)
    do update set
      industry_override = excluded.industry_override,
      updated_at = now();
  end if;

  for portfolio_update in select * from jsonb_array_elements(coalesce(p_portfolio_updates, '[]'::jsonb)) loop
    perform 1
    from public.portfolios
    where id = (portfolio_update ->> 'id')::uuid
      and user_id = auth.uid()
    for update;

    if not found then
      raise exception 'portfolio_not_found'
        using errcode = 'P0002';
    end if;

    update public.portfolios
    set
      cash_balance = (portfolio_update ->> 'cash_balance')::numeric,
      updated_at = coalesce(nullif(portfolio_update ->> 'updated_at', '')::timestamptz, now())
    where id = (portfolio_update ->> 'id')::uuid
      and user_id = auth.uid();
  end loop;
end;
$$;

create or replace function public.save_cash_movement_transaction(
  p_portfolio_id uuid,
  p_type text,
  p_amount numeric,
  p_occurred_at date,
  p_note text
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  target_portfolio public.portfolios%rowtype;
  next_cash_balance numeric(18, 2);
  next_total_deposits numeric(18, 2);
  next_total_withdrawals numeric(18, 2);
  inserted_movement public.cash_movements%rowtype;
begin
  if p_type not in ('deposit', 'withdraw', 'adjust') then
    raise exception 'invalid_cash_movement_type'
      using errcode = '22023';
  end if;

  if p_amount <= 0 then
    raise exception 'invalid_cash_movement_amount'
      using errcode = '22023';
  end if;

  select *
  into target_portfolio
  from public.portfolios
  where id = p_portfolio_id
    and user_id = auth.uid()
  for update;

  if not found then
    raise exception 'portfolio_not_found'
      using errcode = 'P0002';
  end if;

  next_cash_balance := case
    when p_type = 'deposit' then target_portfolio.cash_balance + p_amount
    when p_type = 'withdraw' then target_portfolio.cash_balance - p_amount
    else p_amount
  end;

  if p_type = 'withdraw' and next_cash_balance < 0 then
    raise exception 'insufficient_cash_balance'
      using errcode = '22003';
  end if;

  next_total_deposits := case
    when p_type = 'deposit' then target_portfolio.total_deposits + p_amount
    else target_portfolio.total_deposits
  end;

  next_total_withdrawals := case
    when p_type = 'withdraw' then target_portfolio.total_withdrawals + p_amount
    else target_portfolio.total_withdrawals
  end;

  update public.portfolios
  set
    cash_balance = next_cash_balance,
    total_deposits = next_total_deposits,
    total_withdrawals = next_total_withdrawals,
    updated_at = now()
  where id = target_portfolio.id
    and user_id = auth.uid();

  insert into public.cash_movements (
    id,
    user_id,
    portfolio_id,
    type,
    amount,
    balance_after,
    occurred_at,
    note
  )
  values (
    gen_random_uuid(),
    auth.uid(),
    target_portfolio.id,
    p_type,
    p_amount,
    next_cash_balance,
    coalesce(p_occurred_at, current_date),
    nullif(trim(coalesce(p_note, '')), '')
  )
  returning *
  into inserted_movement;

  return jsonb_build_object(
    'portfolio', to_jsonb((
      select p
      from public.portfolios p
      where p.id = target_portfolio.id
    )),
    'movement', to_jsonb(inserted_movement)
  );
end;
$$;

create or replace function public.delete_portfolio_transaction(p_portfolio_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  perform 1
  from public.portfolios
  where id = p_portfolio_id
    and user_id = auth.uid()
  for update;

  if not found then
    raise exception 'portfolio_not_found'
      using errcode = 'P0002';
  end if;

  delete from public.portfolios
  where id = p_portfolio_id
    and user_id = auth.uid();
end;
$$;

create or replace function public.save_position_adjustment_transaction(
  p_stock jsonb,
  p_adjustment jsonb,
  p_tag_names text[],
  p_industry_override text,
  p_delete_adjustment boolean default false
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  target_stock_id uuid := (p_stock ->> 'id')::uuid;
  target_portfolio_id uuid := (p_adjustment ->> 'portfolio_id')::uuid;
  target_adjustment_id uuid := (p_adjustment ->> 'id')::uuid;
  tag_name text;
begin
  if (p_stock ->> 'user_id')::uuid <> auth.uid()
    or (p_adjustment ->> 'user_id')::uuid <> auth.uid() then
    raise exception 'permission_denied'
      using errcode = '42501';
  end if;

  perform 1
  from public.portfolios
  where id = target_portfolio_id
    and user_id = auth.uid()
  for update;

  if not found then
    raise exception 'portfolio_not_found'
      using errcode = 'P0002';
  end if;

  perform 1
  from public.stocks
  where id = target_stock_id
    and user_id = auth.uid()
  for update;

  if not found then
    raise exception 'stock_not_found'
      using errcode = 'P0002';
  end if;

  update public.stocks
  set
    updated_at = coalesce(nullif(p_stock ->> 'updated_at', '')::timestamptz, now())
  where id = target_stock_id
    and user_id = auth.uid();

  if p_delete_adjustment then
    delete from public.position_adjustments
    where user_id = auth.uid()
      and portfolio_id = target_portfolio_id
      and stock_id = target_stock_id;
  else
    insert into public.position_adjustments (
      id,
      user_id,
      portfolio_id,
      stock_id,
      adjusted_quantity,
      adjusted_cost,
      baseline_traded_at,
      baseline_created_at,
      created_at,
      updated_at
    )
    values (
      target_adjustment_id,
      auth.uid(),
      target_portfolio_id,
      target_stock_id,
      (p_adjustment ->> 'adjusted_quantity')::numeric,
      (p_adjustment ->> 'adjusted_cost')::numeric,
      coalesce(nullif(p_adjustment ->> 'baseline_traded_at', '')::date, current_date),
      coalesce(nullif(p_adjustment ->> 'baseline_created_at', '')::timestamptz, now()),
      coalesce(nullif(p_adjustment ->> 'created_at', '')::timestamptz, now()),
      coalesce(nullif(p_adjustment ->> 'updated_at', '')::timestamptz, now())
    )
    on conflict (user_id, portfolio_id, stock_id)
    do update set
      adjusted_quantity = excluded.adjusted_quantity,
      adjusted_cost = excluded.adjusted_cost,
      baseline_traded_at = excluded.baseline_traded_at,
      baseline_created_at = excluded.baseline_created_at,
      updated_at = excluded.updated_at;
  end if;

  if nullif(trim(coalesce(p_industry_override, '')), '') is null then
    delete from public.portfolio_stock_overrides
    where user_id = auth.uid()
      and portfolio_id = target_portfolio_id
      and stock_id = target_stock_id;
  else
    insert into public.portfolio_stock_overrides (
      user_id,
      portfolio_id,
      stock_id,
      industry_override
    )
    values (
      auth.uid(),
      target_portfolio_id,
      target_stock_id,
      trim(p_industry_override)
    )
    on conflict (user_id, portfolio_id, stock_id)
    do update set
      industry_override = excluded.industry_override,
      updated_at = now();
  end if;

  delete from public.stock_tags
  where user_id = auth.uid()
    and portfolio_id = target_portfolio_id
    and stock_id = target_stock_id;

  foreach tag_name in array coalesce(p_tag_names, array[]::text[]) loop
    if nullif(trim(tag_name), '') is not null then
      insert into public.stock_tags (user_id, portfolio_id, stock_id, name)
      values (auth.uid(), target_portfolio_id, target_stock_id, trim(tag_name))
      on conflict (user_id, portfolio_id, stock_id, name) do nothing;
    end if;
  end loop;
end;
$$;

create or replace function public.import_trades_transaction(
  p_stocks jsonb,
  p_trades jsonb,
  p_portfolio_stock_overrides jsonb,
  p_portfolio_updates jsonb
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  stock_item jsonb;
  trade_item jsonb;
  override_item jsonb;
  portfolio_update jsonb;
  target_stock_id uuid;
  target_trade_id uuid;
  target_portfolio_id uuid;
begin
  for stock_item in select * from jsonb_array_elements(coalesce(p_stocks, '[]'::jsonb)) loop
    target_stock_id := (stock_item ->> 'id')::uuid;

    if (stock_item ->> 'user_id')::uuid <> auth.uid() then
      raise exception 'permission_denied'
        using errcode = '42501';
    end if;

    if exists (
      select 1
      from public.stocks
      where id = target_stock_id
        and user_id = auth.uid()
    ) then
      update public.stocks
      set
        name = stock_item ->> 'name',
        market = coalesce(nullif(stock_item ->> 'market', ''), market),
        industry = nullif(stock_item ->> 'industry', ''),
        current_price = coalesce((stock_item ->> 'current_price')::numeric, current_price),
        price_updated_at = nullif(stock_item ->> 'price_updated_at', '')::timestamptz,
        updated_at = coalesce(nullif(stock_item ->> 'updated_at', '')::timestamptz, now())
      where id = target_stock_id
        and user_id = auth.uid();
    else
      insert into public.stocks (
        id,
        user_id,
        symbol,
        name,
        market,
        industry,
        current_price,
        price_updated_at,
        created_at,
        updated_at
      )
      values (
        target_stock_id,
        auth.uid(),
        stock_item ->> 'symbol',
        stock_item ->> 'name',
        coalesce(nullif(stock_item ->> 'market', ''), 'TWSE'),
        nullif(stock_item ->> 'industry', ''),
        coalesce((stock_item ->> 'current_price')::numeric, 0),
        nullif(stock_item ->> 'price_updated_at', '')::timestamptz,
        coalesce(nullif(stock_item ->> 'created_at', '')::timestamptz, now()),
        coalesce(nullif(stock_item ->> 'updated_at', '')::timestamptz, now())
      );
    end if;
  end loop;

  for override_item in select * from jsonb_array_elements(coalesce(p_portfolio_stock_overrides, '[]'::jsonb)) loop
    target_stock_id := (override_item ->> 'stock_id')::uuid;
    target_portfolio_id := (override_item ->> 'portfolio_id')::uuid;

    if (override_item ->> 'user_id')::uuid <> auth.uid() then
      raise exception 'permission_denied'
        using errcode = '42501';
    end if;

    perform 1
    from public.portfolios
    where id = target_portfolio_id
      and user_id = auth.uid();

    if not found then
      raise exception 'portfolio_not_found'
        using errcode = 'P0002';
    end if;

    perform 1
    from public.stocks
    where id = target_stock_id
      and user_id = auth.uid();

    if not found then
      raise exception 'stock_not_found'
        using errcode = 'P0002';
    end if;

    insert into public.portfolio_stock_overrides (
      id,
      user_id,
      portfolio_id,
      stock_id,
      industry_override,
      created_at,
      updated_at
    )
    values (
      (override_item ->> 'id')::uuid,
      auth.uid(),
      target_portfolio_id,
      target_stock_id,
      nullif(trim(coalesce(override_item ->> 'industry_override', '')), ''),
      coalesce(nullif(override_item ->> 'created_at', '')::timestamptz, now()),
      coalesce(nullif(override_item ->> 'updated_at', '')::timestamptz, now())
    )
    on conflict (user_id, portfolio_id, stock_id)
    do update set
      industry_override = excluded.industry_override,
      updated_at = excluded.updated_at;
  end loop;

  for trade_item in select * from jsonb_array_elements(coalesce(p_trades, '[]'::jsonb)) loop
    target_trade_id := (trade_item ->> 'id')::uuid;
    target_stock_id := (trade_item ->> 'stock_id')::uuid;
    target_portfolio_id := (trade_item ->> 'portfolio_id')::uuid;

    if (trade_item ->> 'user_id')::uuid <> auth.uid() then
      raise exception 'permission_denied'
        using errcode = '42501';
    end if;

    perform 1
    from public.portfolios
    where id = target_portfolio_id
      and user_id = auth.uid()
    for update;

    if not found then
      raise exception 'portfolio_not_found'
        using errcode = 'P0002';
    end if;

    perform 1
    from public.stocks
    where id = target_stock_id
      and user_id = auth.uid();

    if not found then
      raise exception 'stock_not_found'
        using errcode = 'P0002';
    end if;

    insert into public.trades (
      id,
      user_id,
      portfolio_id,
      stock_id,
      type,
      traded_at,
      quantity,
      unit_price,
      gross_amount,
      fee,
      tax,
      net_amount,
      note,
      created_at
    )
    values (
      target_trade_id,
      auth.uid(),
      target_portfolio_id,
      target_stock_id,
      trade_item ->> 'type',
      (trade_item ->> 'traded_at')::date,
      (trade_item ->> 'quantity')::numeric,
      (trade_item ->> 'unit_price')::numeric,
      (trade_item ->> 'gross_amount')::numeric,
      (trade_item ->> 'fee')::numeric,
      (trade_item ->> 'tax')::numeric,
      (trade_item ->> 'net_amount')::numeric,
      nullif(trade_item ->> 'note', ''),
      coalesce(nullif(trade_item ->> 'created_at', '')::timestamptz, now())
    );
  end loop;

  for portfolio_update in select * from jsonb_array_elements(coalesce(p_portfolio_updates, '[]'::jsonb)) loop
    perform 1
    from public.portfolios
    where id = (portfolio_update ->> 'id')::uuid
      and user_id = auth.uid()
    for update;

    if not found then
      raise exception 'portfolio_not_found'
        using errcode = 'P0002';
    end if;

    update public.portfolios
    set
      cash_balance = (portfolio_update ->> 'cash_balance')::numeric,
      updated_at = coalesce(nullif(portfolio_update ->> 'updated_at', '')::timestamptz, now())
    where id = (portfolio_update ->> 'id')::uuid
      and user_id = auth.uid();
  end loop;
end;
$$;

create or replace function public.import_holdings_transaction(
  p_stocks jsonb,
  p_adjustments jsonb,
  p_deleted_adjustments jsonb,
  p_portfolio_stock_overrides jsonb,
  p_tags jsonb,
  p_affected_pairs jsonb
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  stock_item jsonb;
  adjustment_item jsonb;
  deleted_item jsonb;
  override_item jsonb;
  tag_item jsonb;
  affected_pair jsonb;
  target_stock_id uuid;
  target_portfolio_id uuid;
begin
  for stock_item in select * from jsonb_array_elements(coalesce(p_stocks, '[]'::jsonb)) loop
    target_stock_id := (stock_item ->> 'id')::uuid;

    if (stock_item ->> 'user_id')::uuid <> auth.uid() then
      raise exception 'permission_denied'
        using errcode = '42501';
    end if;

    if exists (
      select 1
      from public.stocks
      where id = target_stock_id
        and user_id = auth.uid()
    ) then
      update public.stocks
      set
        name = stock_item ->> 'name',
        market = coalesce(nullif(stock_item ->> 'market', ''), market),
        industry = nullif(stock_item ->> 'industry', ''),
        current_price = coalesce((stock_item ->> 'current_price')::numeric, current_price),
        price_updated_at = nullif(stock_item ->> 'price_updated_at', '')::timestamptz,
        updated_at = coalesce(nullif(stock_item ->> 'updated_at', '')::timestamptz, now())
      where id = target_stock_id
        and user_id = auth.uid();
    else
      insert into public.stocks (
        id,
        user_id,
        symbol,
        name,
        market,
        industry,
        current_price,
        price_updated_at,
        created_at,
        updated_at
      )
      values (
        target_stock_id,
        auth.uid(),
        stock_item ->> 'symbol',
        stock_item ->> 'name',
        coalesce(nullif(stock_item ->> 'market', ''), 'TWSE'),
        nullif(stock_item ->> 'industry', ''),
        coalesce((stock_item ->> 'current_price')::numeric, 0),
        nullif(stock_item ->> 'price_updated_at', '')::timestamptz,
        coalesce(nullif(stock_item ->> 'created_at', '')::timestamptz, now()),
        coalesce(nullif(stock_item ->> 'updated_at', '')::timestamptz, now())
      );
    end if;
  end loop;

  for adjustment_item in select * from jsonb_array_elements(coalesce(p_adjustments, '[]'::jsonb)) loop
    target_stock_id := (adjustment_item ->> 'stock_id')::uuid;
    target_portfolio_id := (adjustment_item ->> 'portfolio_id')::uuid;

    if (adjustment_item ->> 'user_id')::uuid <> auth.uid() then
      raise exception 'permission_denied'
        using errcode = '42501';
    end if;

    perform 1
    from public.portfolios
    where id = target_portfolio_id
      and user_id = auth.uid();

    if not found then
      raise exception 'portfolio_not_found'
        using errcode = 'P0002';
    end if;

    perform 1
    from public.stocks
    where id = target_stock_id
      and user_id = auth.uid();

    if not found then
      raise exception 'stock_not_found'
        using errcode = 'P0002';
    end if;

    insert into public.position_adjustments (
      id,
      user_id,
      portfolio_id,
      stock_id,
      adjusted_quantity,
      adjusted_cost,
      baseline_traded_at,
      baseline_created_at,
      created_at,
      updated_at
    )
    values (
      (adjustment_item ->> 'id')::uuid,
      auth.uid(),
      target_portfolio_id,
      target_stock_id,
      (adjustment_item ->> 'adjusted_quantity')::numeric,
      (adjustment_item ->> 'adjusted_cost')::numeric,
      coalesce(nullif(adjustment_item ->> 'baseline_traded_at', '')::date, current_date),
      coalesce(nullif(adjustment_item ->> 'baseline_created_at', '')::timestamptz, now()),
      coalesce(nullif(adjustment_item ->> 'created_at', '')::timestamptz, now()),
      coalesce(nullif(adjustment_item ->> 'updated_at', '')::timestamptz, now())
    )
    on conflict (user_id, portfolio_id, stock_id)
    do update set
      adjusted_quantity = excluded.adjusted_quantity,
      adjusted_cost = excluded.adjusted_cost,
      baseline_traded_at = excluded.baseline_traded_at,
      baseline_created_at = excluded.baseline_created_at,
      updated_at = excluded.updated_at;
  end loop;

  for deleted_item in select * from jsonb_array_elements(coalesce(p_deleted_adjustments, '[]'::jsonb)) loop
    delete from public.position_adjustments
    where user_id = auth.uid()
      and portfolio_id = (deleted_item ->> 'portfolio_id')::uuid
      and stock_id = (deleted_item ->> 'stock_id')::uuid;
  end loop;

  for override_item in select * from jsonb_array_elements(coalesce(p_portfolio_stock_overrides, '[]'::jsonb)) loop
    target_stock_id := (override_item ->> 'stock_id')::uuid;
    target_portfolio_id := (override_item ->> 'portfolio_id')::uuid;

    if (override_item ->> 'user_id')::uuid <> auth.uid() then
      raise exception 'permission_denied'
        using errcode = '42501';
    end if;

    perform 1
    from public.portfolios
    where id = target_portfolio_id
      and user_id = auth.uid();

    if not found then
      raise exception 'portfolio_not_found'
        using errcode = 'P0002';
    end if;

    perform 1
    from public.stocks
    where id = target_stock_id
      and user_id = auth.uid();

    if not found then
      raise exception 'stock_not_found'
        using errcode = 'P0002';
    end if;

    insert into public.portfolio_stock_overrides (
      id,
      user_id,
      portfolio_id,
      stock_id,
      industry_override,
      created_at,
      updated_at
    )
    values (
      (override_item ->> 'id')::uuid,
      auth.uid(),
      target_portfolio_id,
      target_stock_id,
      nullif(trim(coalesce(override_item ->> 'industry_override', '')), ''),
      coalesce(nullif(override_item ->> 'created_at', '')::timestamptz, now()),
      coalesce(nullif(override_item ->> 'updated_at', '')::timestamptz, now())
    )
    on conflict (user_id, portfolio_id, stock_id)
    do update set
      industry_override = excluded.industry_override,
      updated_at = excluded.updated_at;
  end loop;

  for affected_pair in select * from jsonb_array_elements(coalesce(p_affected_pairs, '[]'::jsonb)) loop
    delete from public.stock_tags
    where user_id = auth.uid()
      and portfolio_id = (affected_pair ->> 'portfolio_id')::uuid
      and stock_id = (affected_pair ->> 'stock_id')::uuid;

    delete from public.portfolio_stock_overrides
    where user_id = auth.uid()
      and portfolio_id = (affected_pair ->> 'portfolio_id')::uuid
      and stock_id = (affected_pair ->> 'stock_id')::uuid
      and not exists (
        select 1
        from jsonb_array_elements(coalesce(p_portfolio_stock_overrides, '[]'::jsonb)) as current_override
        where (current_override ->> 'portfolio_id')::uuid = (affected_pair ->> 'portfolio_id')::uuid
          and (current_override ->> 'stock_id')::uuid = (affected_pair ->> 'stock_id')::uuid
      );
  end loop;

  for tag_item in select * from jsonb_array_elements(coalesce(p_tags, '[]'::jsonb)) loop
    target_stock_id := (tag_item ->> 'stock_id')::uuid;
    target_portfolio_id := (tag_item ->> 'portfolio_id')::uuid;

    if (tag_item ->> 'user_id')::uuid <> auth.uid() then
      raise exception 'permission_denied'
        using errcode = '42501';
    end if;

    insert into public.stock_tags (id, user_id, portfolio_id, stock_id, name)
    values (
      (tag_item ->> 'id')::uuid,
      auth.uid(),
      target_portfolio_id,
      target_stock_id,
      tag_item ->> 'name'
    )
    on conflict (user_id, portfolio_id, stock_id, name) do nothing;
  end loop;
end;
$$;
