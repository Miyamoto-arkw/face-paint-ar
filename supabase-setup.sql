-- designs テーブル
create table designs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text not null check (type in ('cheek', 'eye', 'full')),
  image_url text not null,
  created_at timestamptz default now()
);

-- RLS: 誰でも読める、誰でも書ける（認証追加時に変更）
alter table designs enable row level security;
create policy "public read" on designs for select using (true);
create policy "public insert" on designs for insert with check (true);
create policy "public delete" on designs for delete using (true);

-- Storage バケット: face-paint（public）
-- Supabase ダッシュボードの Storage → New bucket → "face-paint", Public ON
