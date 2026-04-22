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

type BaseNote =
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

export type NoteItem = {
  note: SolfegeNote
  pos: number
  length: number
}

export type Phrase = {
  title: string
  notes: NoteItem[]
}

const noteNamesSharp: BaseNote[] = [
  "ド",
  "ド#",
  "レ",
  "レ#",
  "ミ",
  "ファ",
  "ファ#",
  "ソ",
  "ソ#",
  "ラ",
  "ラ#",
  "シ",
]

function japaneseNoteToMidi(note: SolfegeNote): number | null {
  if (note === "休符") return null

  let octave: number
  let base: BaseNote

  switch (note) {
    case "低いソ":
      octave = 3
      base = "ソ"
      break
    case "低いソ#":
      octave = 3
      base = "ソ#"
      break
    case "低いラ":
      octave = 3
      base = "ラ"
      break
    case "低いラ#":
      octave = 3
      base = "ラ#"
      break
    case "低いシ":
      octave = 3
      base = "シ"
      break

    case "ド":
    case "ド#":
    case "レ":
    case "レ#":
    case "ミ":
    case "ファ":
    case "ファ#":
    case "ソ":
    case "ソ#":
    case "ラ":
    case "ラ#":
    case "シ":
      octave = 4
      base = note
      break

    case "高いド":
      octave = 5
      base = "ド"
      break
    case "高いド#":
      octave = 5
      base = "ド#"
      break
    case "高いレ":
      octave = 5
      base = "レ"
      break
    case "高いレ#":
      octave = 5
      base = "レ#"
      break
    case "高いミ":
      octave = 5
      base = "ミ"
      break
    case "高いファ":
      octave = 5
      base = "ファ"
      break
    case "高いファ#":
      octave = 5
      base = "ファ#"
      break
    case "高いソ":
      octave = 5
      base = "ソ"
      break
    case "高いソ#":
      octave = 5
      base = "ソ#"
      break
    case "高いラ":
      octave = 5
      base = "ラ"
      break
    case "高いラ#":
      octave = 5
      base = "ラ#"
      break
    case "高いシ":
      octave = 5
      base = "シ"
      break

    case "超高いド":
      octave = 6
      base = "ド"
      break

    default:
      return null
  }

  const semitone = noteNamesSharp.indexOf(base)
  if (semitone === -1) return null

  return (octave + 1) * 12 + semitone
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t
}

function invLerp(a: number, b: number, value: number) {
  if (a === b) return 0
  return (value - a) / (b - a)
}

/**
 * 0 = 下端
 * 1 = 上端
 */
function getOtamatoneNormalizedPosition(note: SolfegeNote): number {
  if (note === "休符") return 0.5

  const anchors = [
    { note: "低いソ" as SolfegeNote, pos: 0.0 },
    { note: "低いラ#" as SolfegeNote, pos: 0.25 },
    { note: "レ#" as SolfegeNote, pos: 0.5 },
    { note: "ラ" as SolfegeNote, pos: 0.75 },
    { note: "超高いド" as SolfegeNote, pos: 1.0 },
  ]
    .map((item) => {
      const midi = japaneseNoteToMidi(item.note)
      return midi === null ? null : { midi, pos: item.pos }
    })
    .filter((item): item is { midi: number; pos: number } => item !== null)

  const currentMidi = japaneseNoteToMidi(note)
  if (currentMidi === null) return 0.5

  if (currentMidi <= anchors[0].midi) return anchors[0].pos
  if (currentMidi >= anchors[anchors.length - 1].midi) {
    return anchors[anchors.length - 1].pos
  }

  for (let i = 0; i < anchors.length - 1; i += 1) {
    const a = anchors[i]
    const b = anchors[i + 1]

    if (currentMidi >= a.midi && currentMidi <= b.midi) {
      const t = clamp(invLerp(a.midi, b.midi, currentMidi), 0, 1)
      return lerp(a.pos, b.pos, t)
    }
  }

  return 0.5
}

/**
 * 旧仕様との互換用
 * 0 = 上、100 = 下
 */
function getOtamatonePosPercent(note: SolfegeNote): number {
  if (note === "休符") return 50
  const normalized = getOtamatoneNormalizedPosition(note)
  return (1 - normalized) * 100
}

export const posMap: Record<SolfegeNote, number> = {
  "低いソ": getOtamatonePosPercent("低いソ"),
  "低いソ#": getOtamatonePosPercent("低いソ#"),
  "低いラ": getOtamatonePosPercent("低いラ"),
  "低いラ#": getOtamatonePosPercent("低いラ#"),
  "低いシ": getOtamatonePosPercent("低いシ"),

  ド: getOtamatonePosPercent("ド"),
  "ド#": getOtamatonePosPercent("ド#"),
  レ: getOtamatonePosPercent("レ"),
  "レ#": getOtamatonePosPercent("レ#"),
  ミ: getOtamatonePosPercent("ミ"),

  ファ: getOtamatonePosPercent("ファ"),
  "ファ#": getOtamatonePosPercent("ファ#"),
  ソ: getOtamatonePosPercent("ソ"),
  "ソ#": getOtamatonePosPercent("ソ#"),
  ラ: getOtamatonePosPercent("ラ"),
  "ラ#": getOtamatonePosPercent("ラ#"),
  シ: getOtamatonePosPercent("シ"),

  "高いド": getOtamatonePosPercent("高いド"),
  "高いド#": getOtamatonePosPercent("高いド#"),
  "高いレ": getOtamatonePosPercent("高いレ"),
  "高いレ#": getOtamatonePosPercent("高いレ#"),
  "高いミ": getOtamatonePosPercent("高いミ"),
  "高いファ": getOtamatonePosPercent("高いファ"),
  "高いファ#": getOtamatonePosPercent("高いファ#"),
  "高いソ": getOtamatonePosPercent("高いソ"),
  "高いソ#": getOtamatonePosPercent("高いソ#"),
  "高いラ": getOtamatonePosPercent("高いラ"),
  "高いラ#": getOtamatonePosPercent("高いラ#"),
  "高いシ": getOtamatonePosPercent("高いシ"),

  "超高いド": getOtamatonePosPercent("超高いド"),
  "休符": 50,
}

export const makeNote = (note: SolfegeNote, length = 0.5): NoteItem => ({
  note,
  pos: posMap[note],
  length,
})

export const phrases: Phrase[] = [
  {
    title: "メロディー1",
    notes: [
      makeNote("ファ"),
      makeNote("ソ"),
      makeNote("ラ"),
      makeNote("高いド"),
      makeNote("ソ", 2),
    ],
  },
  {
    title: "メロディー2",
    notes: [
      makeNote("高いファ"),
      makeNote("高いミ"),
      makeNote("高いレ"),
      makeNote("ラ"),
      makeNote("高いド", 2),
    ],
  },
  {
    title: "メロディー3",
    notes: [
      makeNote("高いレ"),
      makeNote("高いミ"),
      makeNote("高いファ"),
      makeNote("高いド", 1),
      makeNote("ファ", 1),
      makeNote("休符", 0.5),
    ],
  },
  {
    title: "メロディー4",
    notes: [
      makeNote("ラ#"),
      makeNote("ラ"),
      makeNote("ファ"),
      makeNote("ド", 1.5),
      makeNote("休符", 1),
    ],
  },
  {
    title: "メロディー5",
    notes: [
      makeNote("レ", 1),
      makeNote("ミ", 1),
      makeNote("ファ", 1),
      makeNote("ラ#", 1),
    ],
  },
  {
    title: "メロディー6",
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
    title: "メロディー7",
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
    title: "メロディー8",
    notes: [
      makeNote("ファ", 1),
      makeNote("ド"),
      makeNote("ソ"),
      makeNote("ファ", 1),
      makeNote("休符", 1),
    ],
  },
]