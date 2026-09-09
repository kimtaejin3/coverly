-- Browser recordings are webm/opus (Chrome, Firefox) or mp4/aac (Safari). The uploads bucket only
-- allowed the song formats, so every personal-voice recording was rejected by storage before it
-- ever reached the trainer.
update storage.buckets
set allowed_mime_types = array[
  'audio/mpeg', 'audio/wav', 'audio/x-wav', 'audio/mp4', 'audio/x-m4a',
  'audio/webm', 'audio/ogg'
]
where id = 'uploads';
