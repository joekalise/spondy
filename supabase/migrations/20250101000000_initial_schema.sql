-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Profiles table (mirrors Supabase auth.users)
create table if not exists public.profiles (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade not null unique,
  age_range text,
  diagnosis_years text,
  severity text,
  medications text[] default '{}',
  pain_locations text[] default '{}',
  pain_types text[] default '{}',
  conditions text[] default '{}',
  morning_stiffness text,
  challenges text[] default '{}',
  notification_time text default '20:00',
  ai_context text default '',
  onboarding_complete boolean default false,
  welcome_message text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.daily_logs (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade not null,
  date date not null,
  pain_score integer check (pain_score >= 0 and pain_score <= 10),
  fatigue_score integer check (fatigue_score >= 0 and fatigue_score <= 10),
  stiffness_duration text,
  mood text,
  notes text default '',
  medications_taken text,
  created_at timestamptz default now(),
  unique(user_id, date)
);

create table if not exists public.health_data (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade not null,
  date date not null,
  steps integer,
  sleep_duration numeric(5,2),
  sleep_quality numeric(3,1),
  hrv numeric(6,2),
  resting_heart_rate numeric(5,1),
  active_calories numeric(8,2),
  workouts integer,
  created_at timestamptz default now(),
  unique(user_id, date)
);

create table if not exists public.flares (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade not null,
  start_date date not null,
  end_date date,
  severity text,
  areas_affected text[] default '{}',
  notes text default '',
  created_at timestamptz default now()
);

create table if not exists public.nudges (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade not null,
  sent_at timestamptz default now(),
  trigger_type text not null,
  message text not null
);

create table if not exists public.medications (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  dose text,
  frequency text not null,
  reminder_time text,
  active boolean default true,
  created_at timestamptz default now()
);

-- Row Level Security
alter table public.profiles enable row level security;
alter table public.daily_logs enable row level security;
alter table public.health_data enable row level security;
alter table public.flares enable row level security;
alter table public.nudges enable row level security;
alter table public.medications enable row level security;

-- RLS Policies: profiles
create policy "Users can view own profile"
  on public.profiles for select
  using (auth.uid() = user_id);

create policy "Users can insert own profile"
  on public.profiles for insert
  with check (auth.uid() = user_id);

create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = user_id);

-- RLS Policies: daily_logs
create policy "Users can view own logs"
  on public.daily_logs for select
  using (auth.uid() = user_id);

create policy "Users can insert own logs"
  on public.daily_logs for insert
  with check (auth.uid() = user_id);

create policy "Users can update own logs"
  on public.daily_logs for update
  using (auth.uid() = user_id);

-- RLS Policies: health_data
create policy "Users can view own health data"
  on public.health_data for select
  using (auth.uid() = user_id);

create policy "Users can insert own health data"
  on public.health_data for insert
  with check (auth.uid() = user_id);

create policy "Users can update own health data"
  on public.health_data for update
  using (auth.uid() = user_id);

-- RLS Policies: flares
create policy "Users can view own flares"
  on public.flares for select
  using (auth.uid() = user_id);

create policy "Users can insert own flares"
  on public.flares for insert
  with check (auth.uid() = user_id);

create policy "Users can update own flares"
  on public.flares for update
  using (auth.uid() = user_id);

-- RLS Policies: nudges
create policy "Users can view own nudges"
  on public.nudges for select
  using (auth.uid() = user_id);

create policy "Users can insert own nudges"
  on public.nudges for insert
  with check (auth.uid() = user_id);

-- RLS Policies: medications
create policy "Users can view own medications"
  on public.medications for select
  using (auth.uid() = user_id);

create policy "Users can insert own medications"
  on public.medications for insert
  with check (auth.uid() = user_id);

create policy "Users can update own medications"
  on public.medications for update
  using (auth.uid() = user_id);

create policy "Users can delete own medications"
  on public.medications for delete
  using (auth.uid() = user_id);

-- Indexes
create index if not exists daily_logs_user_date
  on public.daily_logs(user_id, date desc);

create index if not exists health_data_user_date
  on public.health_data(user_id, date desc);

create index if not exists flares_user_start
  on public.flares(user_id, start_date desc);

create index if not exists nudges_user_sent
  on public.nudges(user_id, sent_at desc);

-- Auto-update updated_at trigger
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function update_updated_at();
