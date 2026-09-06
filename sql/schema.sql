-- =====================================================================
-- המשימות שלי — סכימת מסד הנתונים ל-Supabase
-- =====================================================================
-- הוראות הרצה: העתק את כל הקובץ הזה, הדבק ב-Supabase Dashboard בתפריט
-- "SQL Editor" ולחץ Run. ראה הסבר מלא ב-README.md.
-- =====================================================================

-- מוודא שיש תמיכה ביצירת UUID אקראי
create extension if not exists "pgcrypto";

-- -----------------------------------------------------------------
-- טבלת המשימות
-- -----------------------------------------------------------------
create table if not exists public.tasks (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null default auth.uid(),

  title         text not null,
  completed     boolean not null default false,
  important     boolean not null default false,

  -- שדה קטגוריה: אישי / בית / עבודה / אחר, וגם עתידיים כמו סופר/קניות
  category      text not null default 'personal',

  due_date      date,
  position      integer not null default 0,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  completed_at  timestamptz,

  -- שדה עתידי: הקצאת משימה בין בני זוג (לא בשימוש בגרסה 1)
  assigned_to   text
);

-- אינדקס לשליפה מהירה וממוינת של המשימות של אותו משתמש
create index if not exists tasks_owner_position_idx
  on public.tasks (owner_id, position);

-- -----------------------------------------------------------------
-- עדכון אוטומטי של updated_at בכל שינוי
-- -----------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists tasks_set_updated_at on public.tasks;
create trigger tasks_set_updated_at
  before update on public.tasks
  for each row
  execute procedure public.set_updated_at();

-- -----------------------------------------------------------------
-- אבטחה: Row Level Security
-- -----------------------------------------------------------------
-- כל שורה שייכת ל-owner_id מסוים (מזהה משתמש אנונימי של Supabase Auth).
-- כל מדיניות מוודאת שמשתמש יכול לראות/לשנות רק את המשימות שלו.

alter table public.tasks enable row level security;

drop policy if exists "tasks_select_own" on public.tasks;
create policy "tasks_select_own"
  on public.tasks for select
  using (auth.uid() = owner_id);

drop policy if exists "tasks_insert_own" on public.tasks;
create policy "tasks_insert_own"
  on public.tasks for insert
  with check (auth.uid() = owner_id);

drop policy if exists "tasks_update_own" on public.tasks;
create policy "tasks_update_own"
  on public.tasks for update
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

drop policy if exists "tasks_delete_own" on public.tasks;
create policy "tasks_delete_own"
  on public.tasks for delete
  using (auth.uid() = owner_id);
