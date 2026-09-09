-- The catalogue. Every voice is built from VocalSet (https://zenodo.org/records/1193957), which is
-- released under CC BY 4.0 — commercial use is permitted with attribution, which is why it was
-- chosen over the singing datasets that carry a NonCommercial clause. `source_credit` is rendered
-- on the Voice page so the credit ships with the product rather than living in a file.
--
-- `model_reference` names the fine-tuned checkpoint directory in the Modal models volume.
insert into public.voices (
  id, name, description, gender, tags, range_label, model_reference,
  source_credit, source_license, sort_order, is_active
)
values
  ('aria', 'Aria', '맑고 시원한 고음, 댄스 팝에 잘 맞아요', 'female',
   array['여성','밝은','팝'], 'A3 – E5', 'aria',
   'VocalSet (Wilkins, Seetharaman, Wahl, Pardo — ISMIR 2018), CC BY 4.0', 'CC BY 4.0', 1, true),
  ('nova', 'Nova', '허스키한 중저음, 발라드에서 깊어져요', 'female',
   array['여성','허스키','발라드'], 'F3 – C5', 'nova',
   'VocalSet (Wilkins, Seetharaman, Wahl, Pardo — ISMIR 2018), CC BY 4.0', 'CC BY 4.0', 2, true),
  ('lumi', 'Lumi', '가볍고 부드러운 음색, 시티팝에 어울려요', 'female',
   array['여성','부드러운','시티팝'], 'G3 – D5', 'lumi',
   'VocalSet (Wilkins, Seetharaman, Wahl, Pardo — ISMIR 2018), CC BY 4.0', 'CC BY 4.0', 3, true),
  ('juno', 'Juno', '따뜻한 남성 보컬, 어쿠스틱에 어울려요', 'male',
   array['남성','따뜻한','어쿠스틱'], 'C3 – A4', 'juno',
   'VocalSet (Wilkins, Seetharaman, Wahl, Pardo — ISMIR 2018), CC BY 4.0', 'CC BY 4.0', 4, true),
  ('kai', 'Kai', '단단한 저음, R&B와 힙합에 강해요', 'male',
   array['남성','저음','R&B'], 'A2 – F4', 'kai',
   'VocalSet (Wilkins, Seetharaman, Wahl, Pardo — ISMIR 2018), CC BY 4.0', 'CC BY 4.0', 5, true),
  ('rune', 'Rune', '거친 질감의 록 보컬, 밴드 사운드에 맞아요', 'male',
   array['남성','거친','록'], 'D3 – B4', 'rune',
   'VocalSet (Wilkins, Seetharaman, Wahl, Pardo — ISMIR 2018), CC BY 4.0', 'CC BY 4.0', 6, true)
on conflict (id) do update set
  name = excluded.name,
  description = excluded.description,
  gender = excluded.gender,
  tags = excluded.tags,
  range_label = excluded.range_label,
  model_reference = excluded.model_reference,
  source_credit = excluded.source_credit,
  source_license = excluded.source_license,
  sort_order = excluded.sort_order,
  is_active = excluded.is_active;
