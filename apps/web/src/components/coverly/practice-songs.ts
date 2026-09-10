/**
 * What to sing for a personal voice.
 *
 * Lyrics are literary works: printing a verse of a commercial ballad in the UI is reproduction and
 * public transmission, which is what a KOMCA lyric licence covers and we do not have. Titles are
 * not protected, so a copyrighted song appears here as a suggestion to sing from memory and only
 * the traditional songs — public domain — carry their words.
 *
 * The ordering is deliberate: the model can only reproduce the range it heard, so songs whose
 * chorus climbs well above the verse are listed first.
 */
export interface PracticeSong {
  id: string;
  title: string;
  artist: string;
  /** Why this one helps, and how to sing it. */
  hint: string;
  /** Present only where the work is in the public domain. */
  lyrics?: string[];
}

export const PRACTICE_SONGS: PracticeSong[] = [
  {
    id: "free",
    title: "아는 발라드 아무거나",
    artist: "직접 고르기",
    hint: "가장 잘 아는 곡의 1절이 제일 잘 나와요. 후렴이 높은 곡일수록 좋습니다.",
  },
  {
    id: "sung-두사람",
    title: "두 사람",
    artist: "성시경",
    hint: "잔잔한 절에서 후렴으로 확 올라가요. 남성 중저음에 잘 맞습니다.",
  },
  {
    id: "kim-보고싶다",
    title: "보고싶다",
    artist: "김범수",
    hint: "후렴 고음이 높아 음역이 크게 벌어집니다. 무리면 후렴만 한 키 낮춰도 됩니다.",
  },
  {
    id: "lee-옛사랑",
    title: "옛사랑",
    artist: "이문세",
    hint: "음역이 넓고 템포가 느려서 한 절만 불러도 시간이 충분히 찹니다.",
  },
  {
    id: "kim-서른즈음에",
    title: "서른 즈음에",
    artist: "김광석",
    hint: "음역이 편해 목이 부담 없어요. 대신 두 번째는 꼭 높은 키로 불러주세요.",
  },
  {
    id: "baek-총맞은것처럼",
    title: "총 맞은 것처럼",
    artist: "백지영",
    hint: "여성 고음. 후렴에서 크게 올라가 음역 확보가 쉽습니다.",
  },
  {
    id: "iu-좋은날",
    title: "좋은 날",
    artist: "아이유",
    hint: "여성 곡 중 음역이 가장 넓습니다. 마지막 고음은 넘어가도 괜찮아요.",
  },
  {
    id: "younha-사건의지평선",
    title: "사건의 지평선",
    artist: "윤하",
    hint: "절과 후렴 차이가 커서 한 절만으로 음역이 잘 벌어집니다.",
  },
  {
    id: "arirang",
    title: "아리랑",
    artist: "민요 · 가사 있음",
    hint: "가사가 기억 안 날 때. 옥타브 정도 쓰고, 두 키로 부르면 시간이 찹니다.",
    lyrics: [
      "아리랑 아리랑 아라리요",
      "아리랑 고개로 넘어간다",
      "나를 버리고 가시는 님은",
      "십리도 못가서 발병난다",
    ],
  },
  {
    id: "doraji",
    title: "도라지 타령",
    artist: "민요 · 가사 있음",
    hint: "아리랑으로 시간이 모자랄 때 이어서 부르세요.",
    lyrics: [
      "도라지 도라지 백도라지",
      "심심산천에 백도라지",
      "한두 뿌리만 캐어도",
      "대바구니로 반실만 되누나",
    ],
  },
];
