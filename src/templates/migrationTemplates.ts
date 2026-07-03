// Template: basic Row Level Security policies for user-owned rows.

export function rlsPolicyMigration(tableName: string, ownerColumn = "user_id"): string {
  return `-- Basic Row Level Security for public.${tableName}
-- Users can only read and write rows where ${ownerColumn} = their own auth id.
-- Review before applying.

alter table public.${tableName} enable row level security;

-- Read own rows
create policy "${tableName}_select_own"
  on public.${tableName} for select
  using (auth.uid() = ${ownerColumn});

-- Insert rows for yourself
create policy "${tableName}_insert_own"
  on public.${tableName} for insert
  with check (auth.uid() = ${ownerColumn});

-- Update your own rows
create policy "${tableName}_update_own"
  on public.${tableName} for update
  using (auth.uid() = ${ownerColumn})
  with check (auth.uid() = ${ownerColumn});

-- Delete your own rows
create policy "${tableName}_delete_own"
  on public.${tableName} for delete
  using (auth.uid() = ${ownerColumn});
`;
}
