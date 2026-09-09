/** Shapes shared by the mock data and the future Supabase tables (PRD §32). */

export type CoverStatus = "queued" | "processing" | "completed" | "failed";
export type CoverType = "preview" | "full";

/** The four pipeline stages the worker reports, in the order the user sees them. */
export const GENERATION_STAGES = [
  { key: "separating", label: "보컬 분리 중" },
  { key: "converting", label: "Voice 변환 중" },
  { key: "mixing", label: "음원 합성 중" },
] as const;

export type GenerationStage = (typeof GENERATION_STAGES)[number]["key"];

export interface Voice {
  id: string;
  name: string;
  /** One line under the name on the card. */
  description: string;
  gender: "male" | "female";
  tags: string[];
  /** Service-owned demo: this voice singing over an instrumental we hold rights to. */
  sampleUrl: string;
  /** Song the demo sings, shown so listeners know what they are hearing. */
  sampleTitle: string;
  /** Vocal range the voice was trained on; drives the pitch hint on the create page. */
  rangeLabel: string;
  accent: string;
  /** Credit line required by the voice's source licence (CC BY and similar). */
  sourceCredit: string | null;
  sourceLicense: string | null;
  isActive: boolean;
}

export interface Cover {
  id: string;
  voiceId: string;
  title: string;
  type: CoverType;
  status: CoverStatus;
  previewStartSeconds: number;
  previewDurationSeconds: number;
  resultUrl: string | null;
  createdAt: string;
}

export interface GenerationJob {
  coverId: string;
  status: CoverStatus;
  queuePosition: number;
  stage: GenerationStage | null;
  etaSecondsMin: number;
  etaSecondsMax: number;
  errorMessage: string | null;
}
