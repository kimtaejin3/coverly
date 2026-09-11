-- The sample voices are retired. They were built from VocalSet, which is Italian art song sung on
-- vowels, so they never learned a Korean consonant and the product is the user's own voice now.
--
-- Deactivated rather than deleted: covers.voice_id references them with no ON DELETE, and ten
-- covers already made with them would break. Nothing reads an inactive catalogue row any more.
update public.voices
   set is_active = false
 where owner_user_id is null;
