create extension if not exists vector;

create table if not exists public.private_reference_libraries (
  id uuid primary key,
  owner_user_id uuid not null,
  name text not null,
  description text,
  status text not null default 'ready',
  document_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint private_reference_libraries_status_check
    check (status in ('ready', 'indexing', 'failed')),
  constraint private_reference_libraries_owner_name_key
    unique (owner_user_id, name)
);

create index if not exists private_reference_libraries_owner_updated_idx
  on public.private_reference_libraries (owner_user_id, updated_at desc);

create table if not exists public.private_reference_documents (
  id uuid primary key,
  reference_library_id uuid not null references public.private_reference_libraries(id) on delete cascade,
  owner_user_id uuid not null,
  title text not null,
  storage_bucket text not null,
  storage_path text not null,
  content_size integer not null,
  content_sha256 text not null,
  summary text,
  index_status text not null default 'pending',
  index_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint private_reference_documents_index_status_check
    check (index_status in ('pending', 'indexing', 'ready', 'failed')),
  constraint private_reference_documents_library_id_id_key
    unique (reference_library_id, id)
);

create index if not exists private_reference_documents_owner_library_created_idx
  on public.private_reference_documents (owner_user_id, reference_library_id, created_at desc);

create index if not exists private_reference_documents_owner_status_idx
  on public.private_reference_documents (owner_user_id, index_status);

create table if not exists public.private_reference_document_embeddings (
  id uuid primary key,
  document_id uuid not null references public.private_reference_documents(id) on delete cascade,
  owner_user_id uuid not null,
  summary_text text not null,
  embedding vector(4096) not null,
  embedding_model text not null,
  created_at timestamptz not null default now(),
  constraint private_reference_document_embeddings_document_id_key
    unique (document_id)
);

create index if not exists private_reference_document_embeddings_owner_document_idx
  on public.private_reference_document_embeddings (owner_user_id, document_id);

create or replace function public.match_private_reference_document(
  p_owner_user_id uuid,
  p_reference_library_id uuid,
  p_query_embedding vector(4096)
)
returns table (
  id uuid,
  reference_library_id uuid,
  owner_user_id uuid,
  title text,
  storage_bucket text,
  storage_path text,
  content_size integer,
  content_sha256 text,
  summary text,
  index_status text,
  created_at timestamptz,
  updated_at timestamptz,
  distance double precision
)
language sql
security invoker
set search_path = public
as $$
  select
    d.id,
    d.reference_library_id,
    d.owner_user_id,
    d.title,
    d.storage_bucket,
    d.storage_path,
    d.content_size,
    d.content_sha256,
    d.summary,
    d.index_status,
    d.created_at,
    d.updated_at,
    e.embedding <=> p_query_embedding as distance
  from public.private_reference_documents d
  join public.private_reference_document_embeddings e
    on e.document_id = d.id
  where d.owner_user_id = p_owner_user_id
    and d.reference_library_id = p_reference_library_id
    and d.index_status = 'ready'
  order by e.embedding <=> p_query_embedding asc
  limit 1;
$$;

create or replace function public.increment_private_reference_library_document_count(
  p_owner_user_id uuid,
  p_reference_library_id uuid
)
returns void
language sql
security definer
set search_path = public
as $$
  update public.private_reference_libraries
  set document_count = document_count + 1,
      updated_at = now()
  where owner_user_id = p_owner_user_id
    and id = p_reference_library_id;
$$;

create or replace function public.decrement_private_reference_library_document_count(
  p_owner_user_id uuid,
  p_reference_library_id uuid
)
returns void
language sql
security definer
set search_path = public
as $$
  update public.private_reference_libraries
  set document_count = greatest(document_count - 1, 0),
      updated_at = now()
  where owner_user_id = p_owner_user_id
    and id = p_reference_library_id;
$$;

grant execute on function public.match_private_reference_document(uuid, uuid, vector) to authenticated;
grant execute on function public.increment_private_reference_library_document_count(uuid, uuid) to service_role;
grant execute on function public.decrement_private_reference_library_document_count(uuid, uuid) to service_role;

alter table public.private_reference_libraries enable row level security;
alter table public.private_reference_documents enable row level security;
alter table public.private_reference_document_embeddings enable row level security;

create policy private_reference_libraries_select_own
  on public.private_reference_libraries
  for select
  to authenticated
  using ((select auth.uid()) = owner_user_id);

create policy private_reference_libraries_insert_own
  on public.private_reference_libraries
  for insert
  to authenticated
  with check ((select auth.uid()) = owner_user_id);

create policy private_reference_libraries_update_own
  on public.private_reference_libraries
  for update
  to authenticated
  using ((select auth.uid()) = owner_user_id)
  with check ((select auth.uid()) = owner_user_id);

create policy private_reference_libraries_delete_own
  on public.private_reference_libraries
  for delete
  to authenticated
  using ((select auth.uid()) = owner_user_id);

create policy private_reference_documents_select_own
  on public.private_reference_documents
  for select
  to authenticated
  using ((select auth.uid()) = owner_user_id);

create policy private_reference_documents_insert_own
  on public.private_reference_documents
  for insert
  to authenticated
  with check ((select auth.uid()) = owner_user_id);

create policy private_reference_documents_update_own
  on public.private_reference_documents
  for update
  to authenticated
  using ((select auth.uid()) = owner_user_id)
  with check ((select auth.uid()) = owner_user_id);

create policy private_reference_documents_delete_own
  on public.private_reference_documents
  for delete
  to authenticated
  using ((select auth.uid()) = owner_user_id);

create policy private_reference_document_embeddings_select_own
  on public.private_reference_document_embeddings
  for select
  to authenticated
  using ((select auth.uid()) = owner_user_id);

create policy private_reference_document_embeddings_insert_own
  on public.private_reference_document_embeddings
  for insert
  to authenticated
  with check ((select auth.uid()) = owner_user_id);

create policy private_reference_document_embeddings_update_own
  on public.private_reference_document_embeddings
  for update
  to authenticated
  using ((select auth.uid()) = owner_user_id)
  with check ((select auth.uid()) = owner_user_id);

create policy private_reference_document_embeddings_delete_own
  on public.private_reference_document_embeddings
  for delete
  to authenticated
  using ((select auth.uid()) = owner_user_id);
