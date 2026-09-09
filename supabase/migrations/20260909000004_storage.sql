-- Storage layout (PRD §33-34). Only the original upload and the final result are kept; the worker
-- deletes stems and the converted vocal itself.
--
--   uploads/<user_id>/<cover_id>.<ext>   private   source audio the user uploaded
--   covers/<user_id>/<cover_id>.mp3      private   finished cover, fetched through a signed URL
--   voice-samples/<voice_id>.mp3         public    our own demo of each voice
--
-- uploads and covers are private because a public bucket would hand out a permanent URL to audio
-- derived from someone's commercial track — exactly the distribution we decided not to do.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('uploads', 'uploads', false, 52428800,
   array['audio/mpeg', 'audio/wav', 'audio/x-wav', 'audio/mp4', 'audio/x-m4a']),
  ('covers', 'covers', false, 104857600, array['audio/mpeg']),
  ('voice-samples', 'voice-samples', true, 20971520, array['audio/mpeg'])
on conflict (id) do nothing;

-- Users write and read only inside their own folder; the first path segment is their user id.
create policy "own uploads write"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'uploads'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "own uploads read"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'uploads'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "own uploads delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'uploads'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "own covers read"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'covers'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- Results are written by the worker with the service_role key, so no client INSERT policy.

create policy "anyone reads voice samples"
  on storage.objects for select
  using (bucket_id = 'voice-samples');
