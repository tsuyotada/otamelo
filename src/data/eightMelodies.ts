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
  "低いソ": 0,
  "低いソ#": 4,
  "低いラ": 8,
  "低いラ#": 12,
  "低いシ": 16,

  ド: 20,
  "ド#": 24,
  レ: 28,
  "レ#": 32,
  ミ: 36,

  ファ: 50,
  "ファ#": 54,
  ソ: 58,
  "ソ#": 62,
  ラ: 66,
  "ラ#": 70,
  シ: 74,

  "高いド": 78,
  "高いド#": 82,
  "高いレ": 86,
  "高いレ#": 89,
  "高いミ": 92,
  "高いファ": 94,
  "高いファ#": 96,
  "高いソ": 97,
  "高いソ#": 98,
  "高いラ": 99,
  "高いラ#": 99.5,
  "高いシ": 99.8,

  "超高いド": 100,
  "休符": 50,
}


export const makeNote = (note: SolfegeNote, length = 0.5): NoteItem => ({
  note,
  pos: posMap[note],
  length,
})

export const phrases: Phrase[] = [
  {
    title: "フレーズ1",
    notes: [
      makeNote("ファ"),
      makeNote("ソ"),
      makeNote("ラ"),
      makeNote("高いド"),
      makeNote("ソ", 2),
    ],
  },
  {
    title: "フレーズ2",
    notes: [
      makeNote("高いファ"),
      makeNote("高いミ"),
      makeNote("高いレ"),
      makeNote("ラ"),
      makeNote("高いド", 2),
    ],
  },
  {
    title: "フレーズ3",
    notes: [
      makeNote("高いレ"),
      makeNote("高いミ"),
      makeNote("高いファ"),
      makeNote("高いド", 1),
      makeNote("ファ", 1),
      makeNote("休符", 0.1), 
    ],
  },
  {
    title: "フレーズ4",
    notes: [
      makeNote("ラ#"),
      makeNote("ラ"),
      makeNote("ファ"),
      makeNote("ド", 2),
      makeNote("休符", 0.2), 
    ],
  },
  {
    title: "フレーズ5",
    notes: [
      makeNote("レ", 1),
      makeNote("ミ", 1),
      makeNote("ファ", 1),
      makeNote("ラ#", 1),
    ],
  },
  {
    title: "フレーズ6",
    notes: [
      makeNote("ラ"),
      makeNote("ラ#"),
      makeNote("高いド"),
      makeNote("ラ"),
      makeNote("ソ"),
      makeNote("ラ"),
      makeNote("ラ#"),
      makeNote("ソ"),
    ],
  },
  {
    title: "フレーズ7",
    notes: [
      makeNote("レ"),
      makeNote("ラ#"),
      makeNote("ラ"),
      makeNote("ド"),
      makeNote("ソ", 1),
      makeNote("ミ", 1),
    ],
  },
  {
    title: "フレーズ8",
    notes: [
      makeNote("ファ", 1),
      makeNote("ド"),
      makeNote("ソ"),
      makeNote("ファ", 2),
    ],
  },
]