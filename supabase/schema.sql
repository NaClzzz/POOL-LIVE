create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(trim(display_name)) between 2 and 20),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "Users can read their own profile" on public.profiles;
create policy "Users can read their own profile"
on public.profiles for select
to authenticated
using ((select auth.uid()) = id);

drop policy if exists "Users can create their own profile" on public.profiles;
create policy "Users can create their own profile"
on public.profiles for insert
to authenticated
with check ((select auth.uid()) = id);

drop policy if exists "Users can update their own profile" on public.profiles;
create policy "Users can update their own profile"
on public.profiles for update
to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

create table if not exists public.liked_songs (
  user_id uuid not null references auth.users (id) on delete cascade,
  song_id bigint not null,
  name text not null,
  artists text not null,
  album_name text not null,
  cover_url text,
  duration_ms integer not null check (duration_ms >= 0),
  created_at timestamptz not null default now(),
  primary key (user_id, song_id)
);

alter table public.liked_songs enable row level security;

drop policy if exists "Users can read their own liked songs" on public.liked_songs;
create policy "Users can read their own liked songs"
on public.liked_songs for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Users can add their own liked songs" on public.liked_songs;
create policy "Users can add their own liked songs"
on public.liked_songs for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can remove their own liked songs" on public.liked_songs;
create policy "Users can remove their own liked songs"
on public.liked_songs for delete
to authenticated
using ((select auth.uid()) = user_id);
