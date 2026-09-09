import type { Cover, Voice } from "./types";

/**
 * Phase 1 runs on mock data (PRD §48). Every voice here is a placeholder for one we will own:
 * a contracted singer or a fictional voice, never a real person's voice without permission
 * (PRD §4). Sample audio is a service-owned demo, not a user cover, so nothing on the public
 * pages carries someone else's master recording.
 */
export const VOICES: Voice[] = [
  {
    id: "aria",
    name: "Aria",
    description: "맑고 시원한 고음, 댄스 팝에 잘 맞아요",
    gender: "female",
    tags: ["여성", "밝은", "팝"],
    sampleUrl: "",
    sampleTitle: "Coverly 데모 트랙 1",
    rangeLabel: "A3 – E5",
    accent: "",
    sourceCredit: null,
    sourceLicense: null,
    isActive: true,
  },
  {
    id: "nova",
    name: "Nova",
    description: "허스키한 중저음, 발라드에서 깊어져요",
    gender: "female",
    tags: ["여성", "허스키", "발라드"],
    sampleUrl: "",
    sampleTitle: "Coverly 데모 트랙 2",
    rangeLabel: "F3 – C5",
    accent: "",
    sourceCredit: null,
    sourceLicense: null,
    isActive: true,
  },
  {
    id: "juno",
    name: "Juno",
    description: "따뜻한 남성 보컬, 어쿠스틱에 어울려요",
    gender: "male",
    tags: ["남성", "따뜻한", "어쿠스틱"],
    sampleUrl: "",
    sampleTitle: "Coverly 데모 트랙 3",
    rangeLabel: "C3 – A4",
    accent: "",
    sourceCredit: null,
    sourceLicense: null,
    isActive: true,
  },
  {
    id: "kai",
    name: "Kai",
    description: "단단한 저음, R&B와 힙합에 강해요",
    gender: "male",
    tags: ["남성", "저음", "R&B"],
    sampleUrl: "",
    sampleTitle: "Coverly 데모 트랙 4",
    rangeLabel: "A2 – F4",
    accent: "",
    sourceCredit: null,
    sourceLicense: null,
    isActive: true,
  },
  {
    id: "lumi",
    name: "Lumi",
    description: "가볍고 부드러운 음색, 시티팝에 어울려요",
    gender: "female",
    tags: ["여성", "부드러운", "시티팝"],
    sampleUrl: "",
    sampleTitle: "Coverly 데모 트랙 5",
    rangeLabel: "G3 – D5",
    accent: "",
    sourceCredit: null,
    sourceLicense: null,
    isActive: true,
  },
  {
    id: "rune",
    name: "Rune",
    description: "거친 질감의 록 보컬, 밴드 사운드에 맞아요",
    gender: "male",
    tags: ["남성", "거친", "록"],
    sampleUrl: "",
    sampleTitle: "Coverly 데모 트랙 6",
    rangeLabel: "D3 – B4",
    accent: "",
    sourceCredit: null,
    sourceLicense: null,
    isActive: true,
  },
];

export function getVoice(id: string): Voice | undefined {
  return VOICES.find((voice) => voice.id === id);
}

/** Stand-in for the row a generation writes; the real one comes from Supabase in Phase 2. */
export const SAMPLE_COVER: Cover = {
  id: "demo",
  voiceId: "aria",
  title: "내가 올린 노래",
  type: "preview",
  status: "completed",
  previewStartSeconds: 30,
  previewDurationSeconds: 30,
  resultUrl: null,
  createdAt: new Date().toISOString(),
};
