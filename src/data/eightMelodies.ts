export type SolfegeNote =
  | "低いソ"
  | "低いソ#"
  | "低いラ"
  | "低いラ#"
  | "低いシ"
  | "ド"
  | "ド#"
  | "レ"
  | "レ#"
  | "ミ"
  | "ファ"
  | "ファ#"
  | "ソ"
  | "ソ#"
  | "ラ"
  | "ラ#"
  | "シ"
  | "高いド"
  | "高いド#"
  | "高いレ"
  | "高いレ#"
  | "高いミ"
  | "高いファ"
  | "高いファ#"
  | "高いソ"
  | "高いソ#"
  | "高いラ"
  | "高いラ#"
  | "高いシ"
  | "超高いド"
  | "休符"

export type NoteItem = {
  note: SolfegeNote
  pos: number
  length: number
}

export type Phrase = {
  title: string
  notes: NoteItem[]
}

export const posMap: Record<SolfegeNote, number> = {
  "低いソ": 6,
  "低いソ#": 10,
  "低いラ": 14,
  "低いラ#": 18,
  "低いシ": 22,

  ド: 26,
  "ド#": 30,
  レ: 34,
  "レ#": 38,
  ミ: 42,

  ファ: 50,
  "ファ#": 54,
  ソ: 58,
  "ソ#": 62,
  ラ: 66,
  "ラ#": 70,
  シ: 74,

  "高いド": 78,
  "高いド#": 82,
  "高いレ": 85,
  "高いレ#": 88,
  "高いミ": 91,
  "高いファ": 93,
  "高いファ#": 95,
  "高いソ": 96.5,
  "高いソ#": 97.5,
  "高いラ": 98.5,
  "高いラ#": 99.2,
  "高いシ": 99.6,

  "超高いド": 100,
  "休符": 50,
}

export const makeNote = (
  note: SolfegeNote,
  length = 1
): NoteItem => ({
  note,
  pos: posMap[note],
  length,
})

export const phrases: Phrase[] = [
  {
    title: "メロディー1",
    notes: [
      makeNote("ファ", 0.5),
      makeNote("ソ", 0.5),
      makeNote("ラ", 0.5),
      makeNote("ド", 2),
      makeNote("ソ", 1),
    ],
  },
  {
    title: "メロディー2",
    notes: [
      makeNote("ファ", 0.5),
      makeNote("ミ", 0.5),
      makeNote("レ", 0.5),
      makeNote("ラ", 1),
      makeNote("ド", 2),
    ],
  },
  {
    title: "メロディー3",
    notes: [
      makeNote("レ", 0.5),
      makeNote("ミ", 0.5),
      makeNote("ファ", 0.5),
      makeNote("ド", 1),
      makeNote("ファ", 2),
    ],
  },
  {
    title: "メロディー4",
    notes: [
      makeNote("シ", 0.5),
      makeNote("ラ", 0.5),
      makeNote("ファ", 1),
      makeNote("ド", 2),
    ],
  },
  {
    title: "メロディー5",
    notes: [
      makeNote("レ", 0.5),
      makeNote("ミ", 0.5),
      makeNote("ファ", 0.5),
      makeNote("シ", 2),
    ],
  },
  {
    title: "メロディー6",
    notes: [
      makeNote("ラ", 0.5),
      makeNote("シ", 0.5),
      makeNote("ド", 0.5),
      makeNote("ラ", 0.5),
      makeNote("ソ", 0.5),
      makeNote("ラ", 0.5),
      makeNote("シ", 0.5),
      makeNote("ソ", 2),
    ],
  },
  {
    title: "メロディー7",
    notes: [
      makeNote("レ", 0.5),
      makeNote("シ", 0.5),
      makeNote("ラ", 0.5),
      makeNote("ド", 0.5),
      makeNote("ソ", 0.5),
      makeNote("ミ", 2),
    ],
  },
  {
    title: "メロディー8",
    notes: [
      makeNote("ファ", 1),
      makeNote("ラ", 1),
      makeNote("ソ", 1),
      makeNote("ファ", 2),
    ],
  },
]