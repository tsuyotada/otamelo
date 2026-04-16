export type SolfegeNote =
  | "休符"
  | "低いド"
  | "低いド#"
  | "低いレ"
  | "低いレ#"
  | "低いミ"
  | "低いファ"
  | "低いファ#"
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
  // 休符
  "休符": 0,

  // 低音
  "低いド": 0,
  "低いド#": 3,
  "低いレ": 6,
  "低いレ#": 9,
  "低いミ": 12,
  "低いファ": 16,
  "低いファ#": 19,
  "低いソ": 22,
  "低いソ#": 25,
  "低いラ": 28,
  "低いラ#": 31,
  "低いシ": 34,

  // 中音
  "ド": 40,
  "ド#": 43,
  "レ": 46,
  "レ#": 49,
  "ミ": 52,
  "ファ": 56,
  "ファ#": 59,
  "ソ": 62,
  "ソ#": 65,
  "ラ": 68,
  "ラ#": 71,
  "シ": 74,

　 // 高音
  "高いド": 80,
  "高いド#": 83,
  "高いレ": 86,
  "高いレ#": 89,
  "高いミ": 92,
  "高いファ": 94,
  "高いファ#": 96,
  "高いソ": 97,
  "高いソ#": 98,
  "高いラ": 99,
  "高いラ#": 99.5,
  "高いシ": 100,
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
      makeNote("休符", 2), 
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