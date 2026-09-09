# voices/

Reference recordings for voice conversion. `--voice <name>` resolves to `voices/<name>.wav`
(`.flac/.mp3/.m4a` also work); `--voice path/to/file.wav` works too.

A good reference:
- 5–25 s of ONE singer/speaker (Seed-VC uses at most the first 25 s)
- dry: no backing track, no reverb, no crowd noise
- 44.1 kHz, mono or stereo, wav preferred

Licensing (PRD §4): only voices you have the right to use — licensed, your own, synthetic, or
explicitly permitted. Files here are git-ignored; ship them through storage, not the repo.
