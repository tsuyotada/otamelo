"use client"
import { Cinzel, Nunito } from "next/font/google"
import { useEffect, useMemo, useRef, useState } from "react"
import { phrases } from "@/src/data/eightMelodies"

const noteToFreq: Record<string, number> = {
  "低いソ": 196.0,
  "低いソ#": 207.65,
  "低いラ": 220.0,
  "低いラ#": 233.08,
  "低いシ": 246.94,

  ド: 261.63,
  "ド#": 277.18,
  レ: 293.66,
  "レ#": 311.13,
  ミ: 329.63,
  ファ: 349.23,
  "ファ#": 369.99,
  ソ: 392.0,
  "ソ#": 415.3,
  ラ: 440.0,
  "ラ#": 466.16,
  シ: 493.88,

  "高いド": 523.25,
  "高いド#": 554.37,
  "高いレ": 587.33,
  "高いレ#": 622.25,
  "高いミ": 659.25,
  "高いファ": 698.46,
  "高いファ#": 739.99,
  "高いソ": 783.99,
  "高いソ#": 830.61,
  "高いラ": 880.0,
  "高いラ#": 932.33,
  "高いシ": 987.77,

  "超高いド": 1046.5,
}

type Screen = "home" | "stageSelect" | "practice" | "tune"
type PlayMode = "phrase" | "full"
type JudgeState = "idle" | "ok" | "miss"
type StageId = 1 | 2 | 3 | 4 | 5 | 6

type StageItem = {
  id: StageId
  title: string
}

type PreviewItem = {
  id: string
  note: string
  length: number
  isCurrent: boolean
  isNext: boolean
  isPhraseStart: boolean
  melodyNumber: number
  isPlaceholder?: boolean
  phraseIndex?: number
  noteIndex?: number
  tieToNext?: boolean
}

type FlatNoteItem = {
  phraseIndex: number
  noteIndex: number
  note: string
  length: number
  tieToNext?: boolean
}

type TuningAnchor = {
  id: string
  label: string
  pos: number
  capturedFreq: number | null
  capturedNote: string
}

type TuningSample = {
  freq: number
  note: string
  at: number
}

const TUNING_STORAGE_KEY = "otamelo_tuning_v1"
const SFC_MODE_KEY = "otamelo_sfc_mode"
const VIRTUAL_TAPE_KEY = "otamelo-show-virtual-tape"
const TEMPO_KEY = "otamelo-tempo"
const TUNING_AVERAGE_WINDOW_MS = 800
const TUNING_LOCK_MIN_SAMPLE_COUNT = 6
const TUNING_MIN_RMS = 0.02
const TUNING_MIN_FREQ = 180
const TUNING_MAX_FREQ = 1100

// 見える範囲の上限。
// 1.0 をそのまま使うと顔に隠れるので、見えるギリギリを最高音として扱う。
const OTAMATONE_VISIBLE_MIN = 0.0
const OTAMATONE_VISIBLE_MAX = 0.84

const defaultTuningAnchors: TuningAnchor[] = [
  {
    id: "far",
    label: "顔からいちばん遠いところ",
    pos: 0.0,
    capturedFreq: null,
    capturedNote: "",
  },
  {
    id: "near",
    label: "顔にいちばん近いところ",
    pos: 1.0,
    capturedFreq: null,
    capturedNote: "",
  },
  {
    id: "center",
    label: "全体のまんなかあたり",
    pos: 0.5,
    capturedFreq: null,
    capturedNote: "",
  },
  {
    id: "midNear",
    label: "全体のまんなかと、顔にいちばん近いところの間",
    pos: 0.75,
    capturedFreq: null,
    capturedNote: "",
  },
  {
    id: "midFar",
    label: "全体のまんなかと、顔からいちばん遠いところの間",
    pos: 0.25,
    capturedFreq: null,
    capturedNote: "",
  },
]

const stages: StageItem[] = [
  { id: 1, title: "まずは　オタマトーンをならしてみて" },
  { id: 2, title: "エイトメロディーズの全体を　きいてみて" },
  { id: 3, title: "ひとつめのメロディーを　ひいてみて" },
  { id: 4, title: "ほかのメロディーも　ひいてみて" },
  { id: 5, title: "エイトメロディーズを　とおしで　ひいてみて" },
  { id: 6, title: "本番だ　全体とおして　自分だけでひいてみて" },
]

const noteNamesSharp = [
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

const cinzel = Cinzel({ subsets: ["latin"], weight: ["700", "900"] })
const nunito = Nunito({ subsets: ["latin"], weight: ["400", "700"] })

const STAGE3_TEMPO = 24
const STAGE4_TEMPO = 28
const STAGE5_TEMPO = 34
const STAGE6_TEMPO = 34

function frequencyToMidi(freq: number): number {
  return Math.round(69 + 12 * Math.log2(freq / 440))
}

function midiToJapaneseNote(midi: number): string {
  const octave = Math.floor(midi / 12) - 1
  const noteName = noteNamesSharp[midi % 12]

  if (octave <= 3) return `低い${noteName}`
  if (octave === 4) return noteName
  if (octave === 5) return `高い${noteName}`
  return `超高い${noteName}`
}

function closestNoteFromFrequency(freq: number): string {
  if (!Number.isFinite(freq) || freq <= 0) return ""
  const midi = frequencyToMidi(freq)
  return midiToJapaneseNote(midi)
}

function japaneseNoteToMidi(note: string): number | null {
  if (!note || note === "休符") return null

  let octave = 4
  let base = note

  if (note.startsWith("低い")) {
    octave = 3
    base = note.replace("低い", "")
  } else if (note.startsWith("高い")) {
    octave = 5
    base = note.replace("高い", "")
  } else if (note.startsWith("超高い")) {
    octave = 6
    base = note.replace("超高い", "")
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

function normalizeToVisiblePercent(normalized: number): number {
  const visible = lerp(
    OTAMATONE_VISIBLE_MIN,
    OTAMATONE_VISIBLE_MAX,
    clamp(normalized, 0, 1)
  )
  return visible * 100
}

function getOtamatoneNormalizedPosition(note: string): number | null {
  const anchors = [
    { note: "低いソ", pos: 0.0 },
    { note: "低いラ#", pos: 0.25 },
    { note: "レ#", pos: 0.5 },
    { note: "ラ", pos: 0.75 },
    { note: "超高いド", pos: 1.0 },
  ]
    .map((item) => {
      const midi = japaneseNoteToMidi(item.note)
      return midi === null ? null : { midi, pos: item.pos }
    })
    .filter((item): item is { midi: number; pos: number } => item !== null)

  const currentMidi = japaneseNoteToMidi(note)
  if (currentMidi === null || anchors.length === 0) return null

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

  return null
}

function getOtamatoneTopPercent(note: string): number | null {
  const normalized = getOtamatoneNormalizedPosition(note)
  if (normalized === null) return null
  return normalizeToVisiblePercent(normalized)
}

function getCalibratedNormalizedPositionFromFrequency(
  freq: number,
  tuningAnchors: TuningAnchor[]
): number | null {
  if (!Number.isFinite(freq) || freq <= 0) return null

  const usable = tuningAnchors
    .filter((item) => item.capturedFreq && item.capturedFreq > 0)
    .map((item) => ({
      pos: item.pos,
      freq: item.capturedFreq as number,
    }))
    .sort((a, b) => a.pos - b.pos)

  if (usable.length < 2) return null

  const minAnchor = usable.reduce((prev, curr) =>
    curr.freq < prev.freq ? curr : prev
  )
  const maxAnchor = usable.reduce((prev, curr) =>
    curr.freq > prev.freq ? curr : prev
  )

  if (freq <= minAnchor.freq) return minAnchor.pos
  if (freq >= maxAnchor.freq) return maxAnchor.pos

  const sortedByFreq = [...usable].sort((a, b) => a.freq - b.freq)

  for (let i = 0; i < sortedByFreq.length - 1; i += 1) {
    const a = sortedByFreq[i]
    const b = sortedByFreq[i + 1]

    if (freq >= a.freq && freq <= b.freq) {
      const t = clamp(invLerp(a.freq, b.freq, freq), 0, 1)
      return lerp(a.pos, b.pos, t)
    }
  }

  return null
}

function getCalibratedTopPercentFromFrequency(
  freq: number,
  tuningAnchors: TuningAnchor[]
): number | null {
  const normalized = getCalibratedNormalizedPositionFromFrequency(
    freq,
    tuningAnchors
  )
  if (normalized === null) return null
  return normalizeToVisiblePercent(normalized)
}

function getCalibratedTopPercentFromNote(
  note: string,
  tuningAnchors: TuningAnchor[]
): number | null {
  const freq = noteToFreq[note]
  if (!freq) return null
  return getCalibratedTopPercentFromFrequency(freq, tuningAnchors)
}

function getAutocorrelatedPitch(
  buffer: Float32Array,
  sampleRate: number
): number {
  let rms = 0
  for (let i = 0; i < buffer.length; i += 1) {
    rms += buffer[i] * buffer[i]
  }
  rms = Math.sqrt(rms / buffer.length)
  if (rms < 0.01) return 0

  let r1 = 0
  let r2 = buffer.length - 1
  const threshold = 0.2

  for (let i = 0; i < buffer.length / 2; i += 1) {
    if (Math.abs(buffer[i]) < threshold) {
      r1 = i
      break
    }
  }

  for (let i = 1; i < buffer.length / 2; i += 1) {
    if (Math.abs(buffer[buffer.length - i]) < threshold) {
      r2 = buffer.length - i
      break
    }
  }

  const trimmed = buffer.slice(r1, r2)
  const correlations = new Array(trimmed.length).fill(0)

  for (let lag = 0; lag < trimmed.length; lag += 1) {
    for (let i = 0; i < trimmed.length - lag; i += 1) {
      correlations[lag] += trimmed[i] * trimmed[i + lag]
    }
  }

  let d = 0
  while (d + 1 < correlations.length && correlations[d] > correlations[d + 1]) {
    d += 1
  }

  let maxValue = -1
  let maxIndex = -1
  for (let i = d; i < correlations.length; i += 1) {
    if (correlations[i] > maxValue) {
      maxValue = correlations[i]
      maxIndex = i
    }
  }

  if (maxIndex <= 0) return 0

  const x1 = correlations[maxIndex - 1] ?? correlations[maxIndex]
  const x2 = correlations[maxIndex]
  const x3 = correlations[maxIndex + 1] ?? correlations[maxIndex]
  const a = (x1 + x3 - 2 * x2) / 2
  const b = (x3 - x1) / 2
  const shift = a ? -b / (2 * a) : 0
  const period = maxIndex + shift

  if (!period || period <= 0) return 0
  return sampleRate / period
}

function Spinner() {
  return (
    <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
  )
}

function PixelInventorFace() {
  return (
    <div className="relative h-[32px] w-[32px] shrink-0 overflow-hidden rounded-[4px] bg-[#ffd7b3] shadow-sm">
      <div className="absolute inset-x-0 top-0 h-[9px] bg-[#f2c94c]" />
      <div className="absolute left-[4px] top-[7px] h-[4px] w-[24px] bg-[#e0b63f]" />
      <div className="absolute left-[2px] top-[9px] h-[4px] w-[5px] bg-[#e0b63f]" />
      <div className="absolute right-[2px] top-[9px] h-[4px] w-[5px] bg-[#e0b63f]" />
      <div className="absolute left-[5px] top-[14px] h-[7px] w-[9px] rounded-[2px] border-2 border-slate-800 bg-white/70" />
      <div className="absolute right-[5px] top-[14px] h-[7px] w-[9px] rounded-[2px] border-2 border-slate-800 bg-white/70" />
      <div className="absolute left-1/2 top-[17px] h-[2px] w-[4px] -translate-x-1/2 bg-slate-800" />
      <div className="absolute left-1/2 top-[21px] h-[2px] w-[2px] -translate-x-1/2 bg-[#d6907e]" />
      <div className="absolute left-1/2 top-[25px] h-[2px] w-[9px] -translate-x-1/2 bg-slate-800" />
    </div>
  )
}

function DisplayModeToggle({
  checked,
  onChange,
  dark = false,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  dark?: boolean
}) {
  return (
    <div className={`inline-flex items-center rounded-full p-1 ${dark ? "bg-[#3A4050]" : "bg-[#E9EEF5]"}`}>
      <button
        type="button"
        onClick={() => onChange(false)}
        className={`rounded-full px-3 py-1.5 text-xs font-black ${
          checked ? "text-slate-400" : "bg-white text-[#1F325C] shadow"
        }`}
      >
        ドレミ表示
      </button>

      <button
        type="button"
        onClick={() => onChange(true)}
        className={`rounded-full px-3 py-1.5 text-xs font-black ${
          checked ? "bg-[#3F8CFF] text-white shadow" : "text-slate-400"
        }`}
      >
        音符表示
      </button>
    </div>
  )
}


function getNotationMidi(note: string): number | null {
  return japaneseNoteToMidi(note)
}

// MIDI番号を音名のダイアトニックステップに変換（半音は自然音として扱う）
function midiToDiatonicStep(midi: number): number {
  // C=0, D=1, E=2, F=3, G=4, A=5, B=6（半音は下の自然音に丸める）
  const chromaToDiatonic = [0, 0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6]
  const pitchClass = midi % 12
  const octave = Math.floor(midi / 12) - 1
  return octave * 7 + chromaToDiatonic[pitchClass]
}

// E4(MIDI 64)のダイアトニックステップ = 4*7+2 = 30
// トレブル譜の第1線(下)がE4
const E4_DIATONIC = 30

function getLedgerLineYs(noteCenterY: number, staffTop: number, staffBottom: number, lineGap: number): number[] {
  const lines: number[] = []
  if (noteCenterY < staffTop - 1) {
    for (let y = staffTop - lineGap; y >= noteCenterY - 1; y -= lineGap) lines.push(y)
  }
  if (noteCenterY > staffBottom + 1) {
    for (let y = staffBottom + lineGap; y <= noteCenterY + 1; y += lineGap) lines.push(y)
  }
  return lines
}

function StaffPreview({
  items,
  onSelect,
  compact = false,
  variant = "light",
  onToggleNotation,
}: {
  items: PreviewItem[]
  onSelect?: (item: PreviewItem) => void
  compact?: boolean
  variant?: "light" | "dark"
  onToggleNotation: (checked: boolean) => void
}) {
  const isDark = variant === "dark"
  const visibleItems = items.filter((item) => !item.isPlaceholder)

  // 五線の寸法
  const lineGap = compact ? 10 : 12
  const staffTop = compact ? 38 : 46
  const staffBottom = staffTop + lineGap * 4
  const svgHeight = compact ? 148 : 172

  // 音符の形状
  const noteRx = compact ? 6.5 : 7.5
  const noteRy = compact ? 4.2 : 4.8
  const stemLen = lineGap * 3.5

  // レイアウト：ト音記号 → 拍子記号 → 音符
  const clefX = 14
  const clefW = compact ? 32 : 38          // ト音記号の描画幅
  const timeSigX = clefX + clefW + 4       // ト音記号との間隔
  const timeSigW = compact ? 20 : 24       // 拍子記号の幅
  const notesStart = timeSigX + timeSigW + (compact ? 26 : 30)  // 音符開始位置（臨時記号が拍子記号と重ならない余白）
  // 音符間隔：基本幅＋音価ボーナス（見やすさ優先）
  const baseStep = compact ? 58 : 70        // 8分音符の基本間隔
  const extraPxPerBeat = compact ? 18 : 22  // 0.5拍を超えた分の追加幅

  // MIDI → Y座標（ダイアトニックステップ基準）
  function getNoteY(midi: number): number {
    const diatonic = midiToDiatonicStep(midi)
    const stepsAboveE4 = diatonic - E4_DIATONIC
    return staffBottom - stepsAboveE4 * (lineGap / 2)
  }

  // B4(中間線)のY座標
  const B4_Y = staffBottom - 4 * (lineGap / 2)

  // 音符種別の判定
  type NoteType = "whole" | "half" | "dotted-quarter" | "quarter" | "eighth"
  function getNoteType(length: number): NoteType {
    if (length >= 4) return "whole"
    if (length >= 2) return "half"
    if (length >= 1.4) return "dotted-quarter"
    if (length >= 1) return "quarter"
    return "eighth"
  }

  type NoteData = {
    item: PreviewItem
    index: number
    midi: number | null
    cy: number
    cx: number
    stemUp: boolean
    noteType: NoteType
    isRest: boolean
  }

  // 音符データ：音価ベースの可変間隔で配置（休符を含む）
  const noteDataList: NoteData[] = []
  let noteX = notesStart
  for (const item of visibleItems) {
    const isRest = item.note === "休符"
    if (isRest) {
      noteDataList.push({
        item, index: noteDataList.length,
        midi: null, cy: B4_Y, cx: noteX,
        stemUp: false, noteType: getNoteType(item.length), isRest: true,
      })
    } else {
      const midi = getNotationMidi(item.note)
      if (midi !== null) {
        const cy = getNoteY(midi)
        const stemUp = cy > B4_Y
        const noteType = getNoteType(item.length)
        noteDataList.push({ item, index: noteDataList.length, midi, cy, cx: noteX, stemUp, noteType, isRest: false })
      }
    }
    noteX += baseStep + Math.max(0, item.length - 0.5) * extraPxPerBeat
  }

  const svgWidth = Math.max(460, noteX + 30)

  // 符尾のX座標（stem-up: 右端、stem-down: 左端）
  function stemX(nd: NoteData, up?: boolean): number {
    const dir = up !== undefined ? up : nd.stemUp
    return dir ? nd.cx + noteRx : nd.cx - noteRx
  }

  // 符尾先端のY座標（単独音符・ビームなし時）
  function stemTipY(nd: NoteData): number {
    return nd.stemUp ? nd.cy - stemLen : nd.cy + stemLen
  }

  // ビームグループの型
  type BeamGroupData = {
    notes: NoteData[]
    groupStemUp: boolean
    beamLeftY: number  // 最初のstem先端Y
    beamRightY: number // 最後のstem先端Y
    beamFSX: number    // 最初のstem X
    beamLSX: number    // 最後のstem X
  }

  // グループ全体のbeam計算
  function buildBeamGroup(notes: NoteData[]): BeamGroupData {
    // 平均Y座標でstem方向を一括決定
    const avgCy = notes.reduce((s, n) => s + n.cy, 0) / notes.length
    const groupStemUp = avgCy > B4_Y

    const first = notes[0]
    const last = notes[notes.length - 1]
    const fsx = groupStemUp ? first.cx + noteRx : first.cx - noteRx
    const lsx = groupStemUp ? last.cx + noteRx : last.cx - noteRx

    // 各stem先端Y（標準符尾長）
    let beamLeftY = groupStemUp ? first.cy - stemLen : first.cy + stemLen
    let beamRightY = groupStemUp ? last.cy - stemLen : last.cy + stemLen

    // 傾きを最大1.5線間隔に制限
    const maxTilt = lineGap * 1.5
    const tilt = Math.abs(beamRightY - beamLeftY)
    if (tilt > maxTilt) {
      const center = (beamLeftY + beamRightY) / 2
      const dir = beamRightY > beamLeftY ? 1 : -1
      beamLeftY = center - (dir * maxTilt) / 2
      beamRightY = center + (dir * maxTilt) / 2
    }

    // 全音符の最短符尾長を保証（2.5線間隔）
    const minStem = lineGap * 2.5
    for (let i = 0; i < notes.length; i++) {
      const nd = notes[i]
      const sx = groupStemUp ? nd.cx + noteRx : nd.cx - noteRx
      const t = fsx === lsx ? 0 : (sx - fsx) / (lsx - fsx)
      const beamY = beamLeftY + t * (beamRightY - beamLeftY)
      const actualLen = groupStemUp ? nd.cy - beamY : beamY - nd.cy
      if (actualLen < minStem) {
        const deficit = minStem - actualLen
        if (groupStemUp) {
          beamLeftY -= deficit
          beamRightY -= deficit
        } else {
          beamLeftY += deficit
          beamRightY += deficit
        }
      }
    }

    return { notes, groupStemUp, beamLeftY, beamRightY, beamFSX: fsx, beamLSX: lsx }
  }

  // stem X位置でのbeam Y（線形補間）
  function beamYAtStemX(sx: number, group: BeamGroupData): number {
    if (group.beamFSX === group.beamLSX) return group.beamLeftY
    const t = (sx - group.beamFSX) / (group.beamLSX - group.beamFSX)
    return group.beamLeftY + t * (group.beamRightY - group.beamLeftY)
  }

  // 8分音符を4/4拍子ルールでグループ化（前半2拍・後半2拍）
  const beamGroupsData: BeamGroupData[] = []
  {
    let currentGroup: NoteData[] = []
    let groupBeats = 0
    const MAX_BEATS = 2.0 // 8分音符4つ = 2拍

    for (const nd of noteDataList) {
      if (nd.isRest) {
        if (currentGroup.length >= 2) beamGroupsData.push(buildBeamGroup(currentGroup))
        currentGroup = []
        groupBeats = 0
        continue
      }
      if (nd.noteType === "eighth") {
        const dur = nd.item.length
        if (groupBeats + dur > MAX_BEATS + 0.001) {
          if (currentGroup.length >= 2) beamGroupsData.push(buildBeamGroup(currentGroup))
          currentGroup = [nd]
          groupBeats = dur
        } else {
          currentGroup.push(nd)
          groupBeats += dur
        }
      } else {
        if (currentGroup.length >= 2) beamGroupsData.push(buildBeamGroup(currentGroup))
        currentGroup = []
        groupBeats = 0
      }
    }
    if (currentGroup.length >= 2) beamGroupsData.push(buildBeamGroup(currentGroup))
  }
  const beamedNoteIds = new Set(beamGroupsData.flatMap((g) => g.notes.map((n) => n.item.id)))

  // 臨時記号の種類を事前計算（同一メロディー内で♯→自然音なら♮を表示）
  type AccidentalKind = "sharp" | "natural" | "none"
  const accidentalKinds = new Map<string, AccidentalKind>()
  {
    const sharpedPerMelody = new Map<number, Set<string>>()
    for (const nd of noteDataList) {
      if (nd.isRest) { accidentalKinds.set(nd.item.id, "none"); continue }
      const melodyNum = nd.item.melodyNumber
      if (!sharpedPerMelody.has(melodyNum)) sharpedPerMelody.set(melodyNum, new Set())
      const sharped = sharpedPerMelody.get(melodyNum)!
      const isSharpNote = nd.item.note.endsWith("#")
      const baseName = isSharpNote ? nd.item.note.slice(0, -1) : nd.item.note
      if (isSharpNote) {
        sharped.add(baseName)
        accidentalKinds.set(nd.item.id, "sharp")
      } else if (sharped.has(baseName)) {
        sharped.delete(baseName)
        accidentalKinds.set(nd.item.id, "natural")
      } else {
        accidentalKinds.set(nd.item.id, "none")
      }
    }
  }

  // メロディー間の小節線X座標
  const barLineXs: number[] = []
  for (let i = 1; i < noteDataList.length; i++) {
    if (noteDataList[i]!.item.melodyNumber !== noteDataList[i - 1]!.item.melodyNumber) {
      barLineXs.push((noteDataList[i - 1]!.cx + noteDataList[i]!.cx) / 2)
    }
  }

  // 色
  const staffColor = isDark ? "#667085" : "#94a3b8"
  const clefColor = isDark ? "#94a3b8" : "#475569"
  const boxBg = isDark ? "#202530" : "#FCFCFD"
  const getColor = (nd: NoteData) =>
    nd.item.isCurrent ? "#D4A300" : isDark ? "#e2e8f0" : "#1e293b"
  const getLabelColor = (nd: NoteData) =>
    nd.item.isCurrent ? "#B38700" : isDark ? "#94a3b8" : "#64748b"

  const beamThickness = compact ? 4 : 5

  return (
    <div
      className={
        isDark
          ? "rounded-[28px] bg-[#2A2F3A] px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
          : "mother-subpanel min-h-[214px] px-4 py-3"
      }
    >
      <div className="mb-3 flex items-center justify-between">
        <p className={isDark ? "text-sm font-bold text-white" : "mother-text-main text-sm font-bold"}>
          これからの音
        </p>
        <DisplayModeToggle checked={true} onChange={onToggleNotation} dark={isDark} />
      </div>

      <div
        className={`relative w-full overflow-hidden rounded-[20px] border ${
          isDark ? "border-[#485066]" : "border-slate-200"
        }`}
        style={{ background: boxBg }}
      >
        <svg
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          width="100%"
          style={{ display: "block" }}
        >
          {/* 五線 */}
          {[0, 1, 2, 3, 4].map((i) => (
            <line
              key={i}
              x1={clefX - 2}
              y1={staffTop + i * lineGap}
              x2={svgWidth - 10}
              y2={staffTop + i * lineGap}
              stroke={staffColor}
              strokeWidth={1.5}
            />
          ))}

          {/* ト音記号（ベースラインを第1線=E4に合わせる） */}
          <text
            x={clefX}
            y={staffBottom + lineGap * 0.3}
            fontSize={lineGap * 6}
            fontFamily="'Segoe UI Symbol', 'Apple Symbols', 'Arial Unicode MS', 'FreeSerif', serif"
            fill={clefColor}
          >
            {"𝄞"}
          </text>

          {/* 拍子記号 4/4 */}
          <text
            x={timeSigX + timeSigW / 2}
            y={staffTop + lineGap * 1.85}
            textAnchor="middle"
            fontSize={lineGap * 2}
            fontWeight="bold"
            fontFamily="serif"
            fill={clefColor}
          >
            4
          </text>
          <text
            x={timeSigX + timeSigW / 2}
            y={staffTop + lineGap * 3.85}
            textAnchor="middle"
            fontSize={lineGap * 2}
            fontWeight="bold"
            fontFamily="serif"
            fill={clefColor}
          >
            4
          </text>


          {/* 小節線（メロディー間の区切り） */}
          {barLineXs.map((x, i) => (
            <line
              key={`bar-${i}`}
              x1={x} y1={staffTop - 2}
              x2={x} y2={staffBottom + 2}
              stroke={staffColor}
              strokeWidth={1.5}
            />
          ))}

          {/* 音符・休符・加線・ラベル */}
          {noteDataList.map((nd) => {
            const color = getColor(nd)
            const clickable = !!onSelect
            const accidentalKind = accidentalKinds.get(nd.item.id) ?? "none"
            const hasAccidental = accidentalKind !== "none"
            const accidentalFontSize = compact ? lineGap * 1.8 : lineGap * 2
            const accidentalX = nd.cx - noteRx - (compact ? 10 : 12)

            if (nd.isRest) {
              const restLabel = nd.item.isCurrent ? "いま" : "休"
              const labelY = staffBottom + (compact ? 26 : 30)
              const musicFont =
                "'Segoe UI Symbol', 'Apple Symbols', 'Arial Unicode MS', 'FreeSerif', serif"
              const gProps = {
                key: nd.item.id,
                onClick: () => clickable && onSelect(nd.item),
                style: { cursor: clickable ? "pointer" : "default" } as React.CSSProperties,
              }
              const labelEl = (
                <text
                  x={nd.cx}
                  y={labelY}
                  textAnchor="middle"
                  fontSize={10}
                  fontWeight="900"
                  fill={getLabelColor(nd)}
                >
                  {restLabel}
                </text>
              )

              // 八分休符 (length 0.5)
              if (nd.noteType === "eighth") {
                return (
                  <g {...gProps}>
                    <text
                      x={nd.cx}
                      y={staffBottom - lineGap * 0.3}
                      textAnchor="middle"
                      fontSize={lineGap * 4}
                      fontFamily={musicFont}
                      fill={color}
                    >
                      {"𝄾"}
                    </text>
                    {labelEl}
                  </g>
                )
              }

              // 四分休符 (length 1)
              if (nd.noteType === "quarter") {
                return (
                  <g {...gProps}>
                    <text
                      x={nd.cx}
                      y={staffBottom - lineGap * 0.3}
                      textAnchor="middle"
                      fontSize={lineGap * 4}
                      fontFamily={musicFont}
                      fill={color}
                    >
                      {"𝄽"}
                    </text>
                    {labelEl}
                  </g>
                )
              }

              // フォールバック（二分・全休符など）
              const restW = 7
              const restH = lineGap * 1.8
              const restY = staffTop + lineGap * 1.2
              return (
                <g {...gProps}>
                  <rect
                    x={nd.cx - restW / 2}
                    y={restY}
                    width={restW}
                    height={restH}
                    rx={1}
                    fill={color}
                    opacity={0.7}
                  />
                  {labelEl}
                </g>
              )
            }

            const ledgerYs = getLedgerLineYs(nd.cy, staffTop, staffBottom, lineGap)
            const isHalf = nd.noteType === "half" || nd.noteType === "whole"
            const isWhole = nd.noteType === "whole"
            const inBeam = beamedNoteIds.has(nd.item.id)
            const sx = stemX(nd)

            return (
              <g
                key={nd.item.id}
                onClick={() => clickable && onSelect(nd.item)}
                style={{ cursor: clickable ? "pointer" : "default" }}
              >
                {/* 加線 */}
                {ledgerYs.map((ly, li) => (
                  <line
                    key={li}
                    x1={nd.cx - noteRx - (hasAccidental ? 18 : 4)}
                    y1={ly}
                    x2={nd.cx + noteRx + 4}
                    y2={ly}
                    stroke={staffColor}
                    strokeWidth={1.5}
                  />
                ))}

                {/* 臨時記号（♯ または ♮） */}
                {accidentalKind === "sharp" && (
                  <text
                    x={accidentalX}
                    y={nd.cy + accidentalFontSize * 0.38}
                    textAnchor="middle"
                    fontSize={accidentalFontSize}
                    fontWeight="bold"
                    fontFamily="serif"
                    fill={color}
                  >
                    ♯
                  </text>
                )}
                {accidentalKind === "natural" && (
                  <text
                    x={accidentalX}
                    y={nd.cy + accidentalFontSize * 0.38}
                    textAnchor="middle"
                    fontSize={accidentalFontSize}
                    fontWeight="bold"
                    fontFamily="serif"
                    fill={color}
                  >
                    ♮
                  </text>
                )}

                {/* 音符の玉 */}
                <ellipse
                  cx={nd.cx}
                  cy={nd.cy}
                  rx={noteRx}
                  ry={noteRy}
                  fill={isHalf ? boxBg : color}
                  stroke={color}
                  strokeWidth={isHalf ? 1.8 : 0}
                  transform={isWhole ? undefined : `rotate(-18, ${nd.cx}, ${nd.cy})`}
                />

                {/* 付点（付点4分音符） */}
                {nd.noteType === "dotted-quarter" && (
                  <circle
                    cx={nd.cx + noteRx + (compact ? 5 : 6)}
                    cy={nd.cy - 1}
                    r={compact ? 2 : 2.5}
                    fill={color}
                  />
                )}

                {/* 符尾（全音符以外） */}
                {!isWhole && !inBeam && (
                  <line
                    x1={sx}
                    y1={nd.cy}
                    x2={sx}
                    y2={stemTipY(nd)}
                    stroke={color}
                    strokeWidth={1.5}
                  />
                )}

                {/* 旗（単独8分音符） */}
                {nd.noteType === "eighth" && !inBeam && (
                  <path
                    d={
                      nd.stemUp
                        ? `M ${sx} ${stemTipY(nd)} C ${sx + 12} ${stemTipY(nd) + 6}, ${sx + 14} ${stemTipY(nd) + 14}, ${sx + 7} ${stemTipY(nd) + lineGap * 2}`
                        : `M ${sx} ${stemTipY(nd)} C ${sx + 12} ${stemTipY(nd) - 6}, ${sx + 14} ${stemTipY(nd) - 14}, ${sx + 7} ${stemTipY(nd) - lineGap * 2}`
                    }
                    stroke={color}
                    strokeWidth={1.5}
                    fill="none"
                  />
                )}

                {/* ラベル */}
                <text
                  x={nd.cx}
                  y={staffBottom + (compact ? 26 : 30)}
                  textAnchor="middle"
                  fontSize={11}
                  fontWeight="900"
                  fill={getLabelColor(nd)}
                >
                  {nd.item.isCurrent ? "いま" : ""}
                </text>
              </g>
            )
          })}

          {/* ビーム（8分音符グループ） */}
          {beamGroupsData.map((group, gi) => {
            const { groupStemUp, beamLeftY, beamRightY, beamFSX, beamLSX } = group
            const first = group.notes[0]
            // stem-up: beamは上（小さいY）、beam下辺がstem先端
            // stem-down: beamは下（大きいY）、beam上辺がstem先端
            const fTopY = groupStemUp ? beamLeftY - beamThickness : beamLeftY
            const fBotY = groupStemUp ? beamLeftY : beamLeftY + beamThickness
            const lTopY = groupStemUp ? beamRightY - beamThickness : beamRightY
            const lBotY = groupStemUp ? beamRightY : beamRightY + beamThickness

            return (
              <g key={gi}>
                {/* 各音符の符尾（グループ全体で統一した方向、beam先端まで延伸） */}
                {group.notes.map((nd) => {
                  const sx = stemX(nd, groupStemUp)
                  // stem先端 = beam近辺（stem-up: beam下辺、stem-down: beam上辺）
                  const tipY = beamYAtStemX(sx, group)
                  return (
                    <line
                      key={nd.item.id}
                      x1={sx}
                      y1={nd.cy}
                      x2={sx}
                      y2={tipY}
                      stroke={getColor(nd)}
                      strokeWidth={1.5}
                    />
                  )
                })}

                {/* ビーム線（台形ポリゴン：stem先端同士を結ぶ） */}
                <polygon
                  points={`${beamFSX},${fTopY} ${beamLSX},${lTopY} ${beamLSX},${lBotY} ${beamFSX},${fBotY}`}
                  fill={getColor(first)}
                />
              </g>
            )
          })}

          {/* タイ（tieToNext がある音符から次の音符への弧線） */}
          {noteDataList
            .filter((nd) => !nd.isRest && nd.item.tieToNext)
            .map((nd) => {
              const nextNd = noteDataList[nd.index + 1]
              if (!nextNd || nextNd.isRest) return null
              const tieDir = nd.stemUp ? 1 : -1
              const x1 = nd.cx + noteRx + 2
              const x2 = nextNd.cx - noteRx - 2
              const y1 = nd.cy + tieDir * noteRy
              const y2 = nextNd.cy + tieDir * noteRy
              const midX = (x1 + x2) / 2
              const midY = (y1 + y2) / 2 + tieDir * (compact ? 7 : 9)
              return (
                <path
                  key={`tie-${nd.item.id}`}
                  d={`M ${x1} ${y1} Q ${midX} ${midY} ${x2} ${y2}`}
                  stroke={getColor(nd)}
                  strokeWidth={compact ? 1.5 : 1.8}
                  fill="none"
                />
              )
            })}
        </svg>
      </div>
    </div>
  )
}

function PreviewLane({
  items,
  onSelect,
  showNotation,
  onToggleNotation,
}: {
  items: PreviewItem[]
  onSelect?: (item: PreviewItem) => void
  showNotation: boolean
  onToggleNotation: (checked: boolean) => void
}) {
  if (showNotation) {
    return (
      <StaffPreview
        items={items}
        onSelect={onSelect}
        compact
        onToggleNotation={onToggleNotation}
        variant="light"
      />
    )
  }

  return (
    <div className="mother-subpanel min-h-[180px] px-3 py-2">
      <div className="mb-2 flex items-center justify-between">
        <p className="mother-text-main text-sm font-bold">これからの音</p>

        <DisplayModeToggle
          checked={showNotation}
          onChange={onToggleNotation}
        />
      </div>

      <div className="grid grid-cols-5 gap-2">
        {items.map((item, index) => {
          const toneClass = item.isPlaceholder
            ? "border-transparent bg-white/10 text-transparent shadow-none"
            : item.isCurrent
            ? "border-[#E0B323] bg-[#FFD54A] text-[#1F325C]"
            : item.isNext
            ? "border-[#3F8CFF] bg-[#EAF4FF] text-slate-900"
            : index === 2
            ? "bg-[#F3F8FF]"
            : index === 3
            ? "bg-[#F8FBFF]"
            : "bg-white"

          const clickable = !item.isPlaceholder && onSelect

          return (
            <button
              key={item.id}
              type="button"
              disabled={!clickable}
              onClick={() => clickable && onSelect(item)}
              className={`min-h-[112px] rounded-[18px] border-2 px-2 py-2 text-center ${toneClass} ${
                clickable ? "cursor-pointer transition hover:-translate-y-[2px]" : "cursor-default"
              }`}
            >
              <p className="h-[14px] text-[10px] font-black">
                {item.isCurrent ? "いま" : item.isNext ? "つぎ" : ""}
              </p>

              <p className="mt-1 flex min-h-[38px] items-center justify-center text-[19px] font-black leading-tight">
                {item.isPlaceholder ? "" : item.note}
              </p>

              {!showNotation && (
                <p className="mt-1 text-[10px] font-bold opacity-70">
                  {item.isPlaceholder ? "" : `長さ ${item.length}`}
                </p>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function PreviewLaneSix({
  items,
  staffItems,
  onSelect,
  variant = "light",
  showNotation,
  onToggleNotation,
}: {
  items: PreviewItem[]
  staffItems?: PreviewItem[]
  onSelect?: (item: PreviewItem) => void
  variant?: "light" | "dark"
  showNotation: boolean
  onToggleNotation: (checked: boolean) => void
}) {
  const isDark = variant === "dark"

  if (showNotation) {
    return (
      <StaffPreview
        items={staffItems ?? items}
        onSelect={onSelect}
        compact
        variant={variant}
        onToggleNotation={onToggleNotation}
      />
    )
  }

  return (
    <div
      className={
        isDark
          ? "rounded-[24px] bg-[#2A2F3A] px-3 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
          : "mother-subpanel min-h-[180px] px-3 py-2"
      }
    >
      <div className="mb-2 flex items-center justify-between">
        <p className={isDark ? "text-sm font-bold text-white" : "mother-text-main text-sm font-bold"}>
          これからの音
        </p>

        <DisplayModeToggle
          checked={showNotation}
          onChange={onToggleNotation}
          dark={isDark}
        />
      </div>

      <div className="grid grid-cols-6 gap-2">
        {items.map((item, index) => {
          const toneClass = item.isPlaceholder
            ? isDark
              ? "border-transparent bg-[#232833] text-transparent shadow-none"
              : "border-transparent bg-white/10 text-transparent shadow-none"
            : item.isCurrent
            ? "border-[#E0B323] bg-[#FFD54A] text-[#1F325C]"
            : item.isNext
            ? isDark
              ? "border-[#6B7280] bg-[#4B5263] text-slate-200"
              : "border-[#3F8CFF] bg-[#EAF4FF] text-slate-900"
            : isDark
            ? "border-[#485066] bg-[#343A4D] text-slate-100"
            : index === 2
            ? "bg-[#F3F8FF] text-slate-900"
            : index === 3
            ? "bg-[#F8FBFF] text-slate-900"
            : index === 4
            ? "bg-[#FBFDFF] text-slate-900"
            : "bg-white text-slate-900"

          const clickable = !item.isPlaceholder && onSelect

          return (
            <button
              key={item.id}
              type="button"
              disabled={!clickable}
              onClick={() => clickable && onSelect(item)}
              className={`min-h-[104px] rounded-[16px] border-2 px-2 py-2 text-center ${toneClass} ${
                clickable ? "cursor-pointer transition hover:-translate-y-[2px]" : "cursor-default"
              }`}
            >
              <p
                className={
                  isDark
                    ? "h-[14px] text-[9px] font-black text-inherit/80"
                    : "h-[14px] text-[9px] font-black"
                }
              >
                {item.isCurrent ? "いま" : item.isNext ? "つぎ" : ""}
              </p>

              <p className="mt-1 flex min-h-[38px] items-center justify-center text-[18px] font-black leading-tight">
                {item.isPlaceholder ? "" : item.note}
              </p>

              <p
                className={
                  isDark
                    ? "mt-1 text-[9px] font-bold text-inherit/70"
                    : "mt-1 text-[9px] font-bold opacity-70"
                }
              >
                {item.isPlaceholder ? "" : `長さ ${item.length}`}
              </p>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function makePlaceholders(count: number, prefix: string): PreviewItem[] {
  return Array.from({ length: count }).map((_, i) => ({
    id: `${prefix}-empty-${i}`,
    note: "",
    length: 0,
    isCurrent: false,
    isNext: false,
    isPhraseStart: false,
    melodyNumber: 0,
    isPlaceholder: true,
  }))
}

function getNeighborCapturedAnchors(
  anchors: TuningAnchor[],
  targetId: string
): {
  lower: TuningAnchor | null
  higher: TuningAnchor | null
} {
  const sorted = [...anchors].sort((a, b) => a.pos - b.pos)
  const index = sorted.findIndex((item) => item.id === targetId)

  if (index === -1) {
    return { lower: null, higher: null }
  }

let lower: TuningAnchor | null = null
for (let i = index - 1; i >= 0; i -= 1) {
  const candidate = sorted[i]
  if (candidate && candidate.capturedFreq && candidate.capturedFreq > 0) {
    lower = candidate
    break
  }
}

let higher: TuningAnchor | null = null
for (let i = index + 1; i < sorted.length; i += 1) {
  const candidate = sorted[i]
  if (candidate && candidate.capturedFreq && candidate.capturedFreq > 0) {
    higher = candidate
    break
  }
}

  return { lower, higher }
}

function getTuningGuardErrorMessage(
  anchors: TuningAnchor[],
  target: TuningAnchor,
  freq: number
): string {
  const { lower, higher } = getNeighborCapturedAnchors(anchors, target.id)

  if (lower?.capturedFreq && freq <= lower.capturedFreq) {
    return `この位置の音は「${lower.label}」より高くしてください`
  }

  if (higher?.capturedFreq && freq >= higher.capturedFreq) {
    return `この位置の音は「${higher.label}」より低くしてください`
  }

  return ""
}

function SfcModeToggle({
  isOn,
  onToggle,
  variant = "dark",
}: {
  isOn: boolean
  onToggle: () => void
  variant?: "dark" | "light"
}) {
  const toggleClass = isOn
    ? variant === "dark"
      ? "sfc-toggle dark-on"
      : "sfc-toggle light-on"
    : variant === "dark"
    ? "sfc-toggle dark-off"
    : "sfc-toggle light-off"

  const ledClass = isOn
    ? variant === "dark"
      ? "sfc-toggle-led on-dark"
      : "sfc-toggle-led on-light"
    : variant === "dark"
    ? "sfc-toggle-led off-dark"
    : "sfc-toggle-led off-light"

  return (
    <button type="button" onClick={onToggle} className={toggleClass}>
      <span className={ledClass} />
      SFCモード
      <span style={{ opacity: 0.65 }}>{isOn ? "ON" : "OFF"}</span>
    </button>
  )
}

const TAPE_NOTES = [
  { note: "低いラ", label: "ラ", sub: "低" },
  { note: "低いシ", label: "シ", sub: "低" },
  { note: "ド", label: "ド", sub: "" },
  { note: "レ", label: "レ", sub: "" },
  { note: "ミ", label: "ミ", sub: "" },
  { note: "ファ", label: "ファ", sub: "" },
  { note: "ソ", label: "ソ", sub: "" },
  { note: "ラ", label: "ラ", sub: "" },
  { note: "シ", label: "シ", sub: "" },
  { note: "高いド", label: "ド", sub: "高" },
  { note: "高いレ", label: "レ", sub: "高" },
  { note: "高いミ", label: "ミ", sub: "高" },
  { note: "高いファ", label: "ファ", sub: "高" },
  { note: "高いソ", label: "ソ", sub: "高" },
] as const

function VirtualTape() {
  return (
    <div
      className="pointer-events-none absolute top-0 h-full"
      style={{ left: "calc(100% + 5px)", width: "22px" }}
    >
      <div
        className="absolute inset-0 rounded-[2px]"
        style={{
          background: "rgba(255,252,230,0.92)",
          borderLeft: "1px solid rgba(195,170,110,0.45)",
          borderRight: "1px solid rgba(195,170,110,0.45)",
        }}
      />
      {TAPE_NOTES.map(({ note, label, sub }) => {
        const topPercent = getOtamatoneTopPercent(note)
        if (topPercent === null) return null
        return (
          <div
            key={note}
            className="absolute left-0 right-0 flex items-center"
            style={{ top: `${topPercent}%`, transform: "translateY(-50%)" }}
          >
            <div
              className="ml-1 shrink-0"
              style={{ width: "4px", height: "1px", background: "rgba(165,140,80,0.55)" }}
            />
            <div className="ml-0.5 flex flex-col items-start leading-none">
              {sub && (
                <span
                  className="font-bold text-[#a08050]"
                  style={{ fontSize: "5px", lineHeight: 1 }}
                >
                  {sub}
                </span>
              )}
              <span
                className="font-bold text-[#6b5030]"
                style={{ fontSize: "8px", lineHeight: 1 }}
              >
                {label}
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

const TEMPO_OPTIONS = [
  { label: "ゆっくり", value: 1 },
  { label: "ふつう", value: 1.25 },
  { label: "はやい", value: 1.5 },
] as const
type TempoMultiplier = (typeof TEMPO_OPTIONS)[number]["value"]

function TempoSelector({
  value,
  onChange,
  variant,
}: {
  value: TempoMultiplier
  onChange: (v: TempoMultiplier) => void
  variant: "blue" | "red"
}) {
  return (
    <div className="flex gap-1">
      {TEMPO_OPTIONS.map((opt) => {
        const isActive = value === opt.value
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={`rounded-full px-3 py-1.5 text-xs font-bold transition active:scale-95 ${
              isActive
                ? variant === "blue"
                  ? "bg-[#3F8CFF] text-white shadow-[0_2px_8px_rgba(63,140,255,0.4)]"
                  : "bg-white text-[#11141B] shadow-[0_2px_8px_rgba(255,255,255,0.2)]"
                : "bg-white/10 text-slate-300"
            }`}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}

export default function Page() {
  const [screen, setScreen] = useState<Screen>("home")
  const [selectedStage, setSelectedStage] = useState<StageId>(1)
  const [isFading, setIsFading] = useState(false)
  const [stageSelectVisible, setStageSelectVisible] = useState(false)
  const [phraseIndex, setPhraseIndex] = useState(0)
  const [noteIndex, setNoteIndex] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [tempoMultiplier, setTempoMultiplier] = useState<TempoMultiplier>(1)
  const [tempo, setTempo] = useState(40)
  const [playMode, setPlayMode] = useState<PlayMode>("full")
  const [isPreparingAudio, setIsPreparingAudio] = useState(false)
  const [countdown, setCountdown] = useState<number | null>(null)
  const [showNotation, setShowNotation] = useState(false)
const [tuningGuardMessage, setTuningGuardMessage] = useState("")
  const [isMicEnabled, setIsMicEnabled] = useState(false)
  const [isMicPreparing, setIsMicPreparing] = useState(false)
  const [detectedNote, setDetectedNote] = useState("")
  const [detectedFreq, setDetectedFreq] = useState(0)
  const [judgeState, setJudgeState] = useState<JudgeState>("idle")
  const [successCount, setSuccessCount] = useState(0)

  const [tuningAnchors, setTuningAnchors] =
    useState<TuningAnchor[]>(defaultTuningAnchors)
  const [tuningStepIndex, setTuningStepIndex] = useState(0)
  const [tuningCompleted, setTuningCompleted] = useState(false)
  const [tuningAverageFreq, setTuningAverageFreq] = useState(0)
  const [tuningAverageNote, setTuningAverageNote] = useState("")
  const [tuningLockedFreq, setTuningLockedFreq] = useState(0)
  const [tuningLockedNote, setTuningLockedNote] = useState("")

  const [stage6Score, setStage6Score] = useState(0)
  const [stage6Hits, setStage6Hits] = useState(0)
  const [stage6JudgedCount, setStage6JudgedCount] = useState(0)
  const [stage6ResultOpen, setStage6ResultOpen] = useState(false)

  const [isSfcMode, setIsSfcMode] = useState(false)
  const [showVirtualTape, setShowVirtualTape] = useState(true)

  const audioContextRef = useRef<AudioContext | null>(null)
  const timerRef = useRef<number | null>(null)
  const countdownTimerRef = useRef<number | null>(null)

  const micStreamRef = useRef<MediaStream | null>(null)
  const micAudioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const micSourceRef = useRef<MediaStreamAudioSourceNode | null>(null)
  const micAnimationRef = useRef<number | null>(null)
  const tuningSamplesRef = useRef<TuningSample[]>([])

  const stableHitCountRef = useRef(0)
  const noteSolvedRef = useRef(false)
  const stage1AutoMicTriedRef = useRef(false)
  const metronomeBeatRef = useRef<number | null>(null)
  const playbackStartRef = useRef<number>(0)
  const elapsedBeatsRef = useRef<number>(0)

  const safePhrases = useMemo(
    () =>
      phrases.map((phrase, index) => ({
        ...phrase,
        title: phrase.title || `メロディー${index + 1}`,
        notes: phrase.notes.length > 0 ? phrase.notes : [phrases[0].notes[0]],
      })),
    []
  )

  const flatPlayableNotes = useMemo<FlatNoteItem[]>(() => {
    return safePhrases.flatMap((phrase, pIndex) =>
      phrase.notes
        .map((note, nIndex) => ({
          phraseIndex: pIndex,
          noteIndex: nIndex,
          note: note.note,
          length: note.length,
          tieToNext: note.tieToNext,
        }))
        .filter((item) => item.note !== "休符")
    )
  }, [safePhrases])

  const totalPlayableNotes = flatPlayableNotes.length

  const getFlatPlayableIndex = (pIndex: number, nIndex: number) => {
    return flatPlayableNotes.findIndex(
      (item) => item.phraseIndex === pIndex && item.noteIndex === nIndex
    )
  }

  const flatTimingNotes = useMemo<FlatNoteItem[]>(() => {
    return safePhrases.flatMap((phrase, pIndex) =>
      phrase.notes.map((note, nIndex) => ({
        phraseIndex: pIndex,
        noteIndex: nIndex,
        note: note.note,
        length: note.length,
        tieToNext: note.tieToNext,
      }))
    )
  }, [safePhrases])

  const getFlatTimingIndex = (pIndex: number, nIndex: number) => {
    return flatTimingNotes.findIndex(
      (item) => item.phraseIndex === pIndex && item.noteIndex === nIndex
    )
  }

  const phrase = safePhrases[phraseIndex]
  const safeNotes = phrase.notes
  const current = safeNotes[noteIndex] ?? safeNotes[0]
  const stageLabel =
    stages.find((stage) => stage.id === selectedStage)?.title ?? ""

  const hasCustomTuning = tuningAnchors.some(
    (item) => item.capturedFreq !== null
  )

  const currentTuningAnchor = tuningAnchors[tuningStepIndex] ?? null

  const stage1IndicatorTop =
    isMicEnabled && detectedFreq > 0
      ? getCalibratedTopPercentFromFrequency(detectedFreq, tuningAnchors) ??
        (detectedNote ? getOtamatoneTopPercent(detectedNote) : null)
      : null

  const nextVisibleNote = useMemo(() => {
    if (selectedStage === 5 || selectedStage === 6) {
      const flatIndex = getFlatPlayableIndex(phraseIndex, noteIndex)
      if (flatIndex >= 0 && flatIndex < flatPlayableNotes.length - 1) {
        return {
          note: flatPlayableNotes[flatIndex + 1].note,
          length: flatPlayableNotes[flatIndex + 1].length,
        }
      }
      if (flatIndex < 0) {
        const nextPlayable = flatPlayableNotes.find(
          (item) =>
            item.phraseIndex > phraseIndex ||
            (item.phraseIndex === phraseIndex && item.noteIndex > noteIndex)
        )
        if (nextPlayable) return { note: nextPlayable.note, length: nextPlayable.length }
      }
      return null
    }

    for (let i = noteIndex + 1; i < safeNotes.length; i += 1) {
      if (safeNotes[i].note !== "休符") return safeNotes[i]
    }

    if (playMode !== "phrase") {
      for (let p = phraseIndex + 1; p < safePhrases.length; p += 1) {
        for (const note of safePhrases[p].notes) {
          if (note.note !== "休符") return note
        }
      }
    }

    return null
  }, [
    selectedStage,
    phraseIndex,
    noteIndex,
    flatPlayableNotes,
    safeNotes,
    playMode,
    safePhrases,
  ])

const previewItems = useMemo<PreviewItem[]>(() => {
  if (selectedStage === 3) {
    const visible = safePhrases[0].notes
      .filter((item) => item.note !== "休符")
      .slice(0, 5)
      .map((item, index) => ({
        id: `stage3-${index}-${item.note}`,
        note: item.note,
        length: item.length,
        isCurrent: index === noteIndex,
        isNext: index === noteIndex + 1,
        isPhraseStart: false,
        melodyNumber: 1,
        phraseIndex: 0,
        noteIndex: index,
        tieToNext: item.tieToNext,
      }))

    return [
      ...visible,
      ...makePlaceholders(Math.max(0, 5 - visible.length), "stage3"),
    ]
  }

  if (selectedStage === 4) {
    const usableNotes = safePhrases[phraseIndex].notes.filter(
      (item) => item.note !== "休符"
    )

    // 楽譜表示時はメロディー全音符を一覧表示（休符含む）
    if (showNotation) {
      return safePhrases[phraseIndex].notes.map((item, index) => ({
        id: `stage4-full-${phraseIndex}-${index}-${item.note}`,
        note: item.note,
        length: item.length,
        isCurrent: index === noteIndex,
        isNext: index === noteIndex + 1,
        isPhraseStart: false,
        melodyNumber: phraseIndex + 1,
        phraseIndex: phraseIndex,
        noteIndex: index,
        tieToNext: item.tieToNext,
      }))
    }

    // 通常表示は5音ウィンドウ
    let windowStart = 0
    if (noteIndex >= 4) {
      const candidateStart = 4 * Math.floor((noteIndex - 4) / 4) + 4
      const hasMoreAfterCurrentWindow =
        usableNotes.length > candidateStart + 1
      windowStart = hasMoreAfterCurrentWindow
        ? candidateStart
        : Math.max(0, usableNotes.length - 5)
    }

    const visible = usableNotes
      .slice(windowStart, windowStart + 5)
      .map((item, index) => {
        const originalIndex = windowStart + index
        return {
          id: `stage4-${phraseIndex}-${originalIndex}-${item.note}`,
          note: item.note,
          length: item.length,
          isCurrent: originalIndex === noteIndex,
          isNext: originalIndex === noteIndex + 1,
          isPhraseStart: false,
          melodyNumber: phraseIndex + 1,
          phraseIndex: phraseIndex,
          noteIndex: originalIndex,
          tieToNext: item.tieToNext,
        }
      })

    return [
      ...visible,
      ...makePlaceholders(Math.max(0, 5 - visible.length), "stage4"),
    ]
  }

  if (selectedStage === 5 || selectedStage === 6) {
    let safeFlatIndex = getFlatPlayableIndex(phraseIndex, noteIndex)
    if (safeFlatIndex < 0) {
      let last = -1
      for (let i = 0; i < flatPlayableNotes.length; i++) {
        const item = flatPlayableNotes[i]
        if (
          item.phraseIndex < phraseIndex ||
          (item.phraseIndex === phraseIndex && item.noteIndex < noteIndex)
        ) {
          last = i
        } else {
          break
        }
      }
      safeFlatIndex = Math.max(0, last)
    }

    const isOnRest = safeNotes[noteIndex]?.note === "休符"

    let windowStart = 0
    if (safeFlatIndex >= 5) {
      const candidateStart = 5 * Math.floor((safeFlatIndex - 5) / 5) + 5
      const hasMoreAfterCurrentWindow =
        flatPlayableNotes.length > candidateStart + 1
      windowStart = hasMoreAfterCurrentWindow
        ? candidateStart
        : Math.max(0, flatPlayableNotes.length - 6)
    }

    const visible = flatPlayableNotes
      .slice(windowStart, windowStart + 6)
      .map((item, index) => {
        const originalIndex = windowStart + index
        return {
          id: `stage56-${originalIndex}-${item.note}`,
          note: item.note,
          length: item.length,
          isCurrent: !isOnRest && originalIndex === safeFlatIndex,
          isNext: originalIndex === safeFlatIndex + 1,
          isPhraseStart: false,
          melodyNumber: item.phraseIndex + 1,
          phraseIndex: item.phraseIndex,
          noteIndex: item.noteIndex,
          tieToNext: item.tieToNext,
        }
      })

    return [
      ...visible,
      ...makePlaceholders(Math.max(0, 6 - visible.length), "stage56"),
    ]
  }

  const items: PreviewItem[] = []
  let p = phraseIndex
  let n = noteIndex
  let safety = 0

  while (items.length < 5 && safety < 200) {
    safety += 1
    if (p >= safePhrases.length) break

    const targetPhrase = safePhrases[p]
    if (!targetPhrase) break

    if (n >= targetPhrase.notes.length) {
      if (playMode === "phrase") break
      p += 1
      n = 0
      continue
    }

    const target = targetPhrase.notes[n]
    const isCurrent = p === phraseIndex && n === noteIndex

    if (target.note !== "休符") {
      items.push({
        id: `${p}-${n}-${target.note}`,
        note: target.note,
        length: target.length,
        isCurrent,
        isNext: false,
        isPhraseStart: p !== phraseIndex && n === 0,
        melodyNumber: p + 1,
        phraseIndex: p,
        noteIndex: n,
        tieToNext: target.tieToNext,
      })
    }

    n += 1
  }

  const firstPreviewIndex = items.findIndex(
    (item) => !item.isCurrent && !item.isPlaceholder
  )

  if (firstPreviewIndex !== -1) {
    items[firstPreviewIndex] = {
      ...items[firstPreviewIndex],
      isNext: true,
    }
  }

  return [...items, ...makePlaceholders(Math.max(0, 5 - items.length), "d")]
}, [
  selectedStage,
  safePhrases,
  phraseIndex,
  noteIndex,
  playMode,
  flatPlayableNotes,
  showNotation,
])

const pairPreviewItems = useMemo<PreviewItem[]>(() => {
  if (selectedStage !== 5 && selectedStage !== 6) return []

  const pairStart = Math.floor(phraseIndex / 2) * 2
  const items: PreviewItem[] = []

  for (let pi = pairStart; pi <= pairStart + 1 && pi < safePhrases.length; pi++) {
    const phrase = safePhrases[pi]
    for (let ni = 0; ni < phrase.notes.length; ni++) {
      const note = phrase.notes[ni]
      items.push({
        id: `pair-${pi}-${ni}-${note.note}`,
        note: note.note,
        length: note.length,
        isCurrent: pi === phraseIndex && ni === noteIndex,
        isNext: false,
        isPhraseStart: false,
        melodyNumber: pi + 1,
        phraseIndex: pi,
        noteIndex: ni,
        tieToNext: note.tieToNext,
      })
    }
  }

  return items
}, [selectedStage, safePhrases, phraseIndex, noteIndex])

  const currentIndicatorTop =
    getCalibratedTopPercentFromNote(current.note, tuningAnchors) ??
    getOtamatoneTopPercent(current.note)

  const nextIndicatorTop = nextVisibleNote
    ? getCalibratedTopPercentFromNote(nextVisibleNote.note, tuningAnchors) ??
      getOtamatoneTopPercent(nextVisibleNote.note)
    : null

  const indicatorsAreClose =
    currentIndicatorTop !== null &&
    nextIndicatorTop !== null &&
    Math.abs(currentIndicatorTop - nextIndicatorTop) < 3

  const totalNotes = useMemo(
    () => safePhrases.reduce((sum, p) => sum + p.notes.length, 0),
    [safePhrases]
  )

  const passedNotes = useMemo(
    () =>
      safePhrases
        .slice(0, phraseIndex)
        .reduce((sum, p) => sum + p.notes.length, 0) +
      noteIndex +
      1,
    [safePhrases, phraseIndex, noteIndex]
  )

  const progressPercent = totalNotes > 0 ? (passedNotes / totalNotes) * 100 : 0

  const stage6Accuracy =
    stage6JudgedCount > 0
      ? Math.round((stage6Hits / stage6JudgedCount) * 100)
      : 0

  const clearPlaybackTimer = () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }

  const clearCountdownTimer = () => {
    if (countdownTimerRef.current !== null) {
      window.clearTimeout(countdownTimerRef.current)
      countdownTimerRef.current = null
    }
  }

  const stopMetronome = () => {
    if (metronomeBeatRef.current !== null) {
      window.clearTimeout(metronomeBeatRef.current)
      metronomeBeatRef.current = null
    }
  }

  const resetStage6Result = () => {
    setStage6Score(0)
    setStage6Hits(0)
    setStage6JudgedCount(0)
    setStage6ResultOpen(false)
  }

  const getStepMs = (length = 1) => {
    const effectiveTempo =
      selectedStage === 3
        ? STAGE3_TEMPO
        : selectedStage === 4
        ? STAGE4_TEMPO
        : selectedStage === 5
        ? STAGE5_TEMPO * tempoMultiplier
        : selectedStage === 6
        ? STAGE6_TEMPO * tempoMultiplier
        : tempo

    const base = Math.round(60000 / effectiveTempo)
    return Math.max(120, base * length)
  }

  const ensureAudioReady = async () => {
    if (typeof window === "undefined") return null

    setIsPreparingAudio(true)

    try {
      const AudioCtx =
        window.AudioContext ||
        (window as typeof window & {
          webkitAudioContext?: typeof AudioContext
        }).webkitAudioContext

      if (!AudioCtx) {
        setIsPreparingAudio(false)
        return null
      }

      if (!audioContextRef.current) {
        audioContextRef.current = new AudioCtx()
      }

      const ctx = audioContextRef.current

      if (ctx.state === "suspended") {
        await ctx.resume()
      }

      return ctx
    } catch {
      return null
    } finally {
      setIsPreparingAudio(false)
    }
  }

  const playNote = async (note: string, durationMs: number) => {
    if (note === "休符") return

    const freq = noteToFreq[note]
    if (!freq) return

    const ctx = await ensureAudioReady()
    if (!ctx) return

    const oscillator = ctx.createOscillator()
    const gainNode = ctx.createGain()

    const now = ctx.currentTime
    const durationSec = durationMs / 1000
    const fadeIn = 0.02
    const fadeOut = Math.min(0.12, durationSec / 3)
    const holdUntil = Math.max(fadeIn + 0.02, durationSec - fadeOut)

    oscillator.type = "sine"
    oscillator.frequency.value = freq

    gainNode.gain.setValueAtTime(0.0001, now)
    gainNode.gain.exponentialRampToValueAtTime(0.18, now + fadeIn)
    gainNode.gain.setValueAtTime(0.18, now + holdUntil)
    gainNode.gain.exponentialRampToValueAtTime(0.0001, now + durationSec)

    oscillator.connect(gainNode)
    gainNode.connect(ctx.destination)

    oscillator.start(now)
    oscillator.stop(now + durationSec)
  }

  const playClick = async () => {
    const ctx = await ensureAudioReady()
    if (!ctx) return

    const now = ctx.currentTime

    const oscillator = ctx.createOscillator()
    const gainNode = ctx.createGain()
    const filter = ctx.createBiquadFilter()

    oscillator.type = "square"
    oscillator.frequency.setValueAtTime(1800, now)
    oscillator.frequency.exponentialRampToValueAtTime(900, now + 0.04)

    filter.type = "lowpass"
    filter.frequency.setValueAtTime(2200, now)

    gainNode.gain.setValueAtTime(0.0001, now)
    gainNode.gain.exponentialRampToValueAtTime(0.07, now + 0.004)
    gainNode.gain.exponentialRampToValueAtTime(0.0001, now + 0.05)

    oscillator.connect(filter)
    filter.connect(gainNode)
    gainNode.connect(ctx.destination)

    oscillator.start(now)
    oscillator.stop(now + 0.055)
  }

  const playCurrentNote = async () => {
    if (isMicEnabled) return
    await playNote(current.note, getStepMs(current.length))
  }

  const moveToNextNote = () => {
    if (selectedStage === 5 || selectedStage === 6) {
      const flatIndex = getFlatTimingIndex(phraseIndex, noteIndex)

      if (flatIndex >= 0 && flatIndex < flatTimingNotes.length - 1) {
        const nextFlat = flatTimingNotes[flatIndex + 1]
        setPhraseIndex(nextFlat.phraseIndex)
        setNoteIndex(nextFlat.noteIndex)
        return
      }

      setIsPlaying(false)
      if (selectedStage === 6) {
        setStage6ResultOpen(true)
      }
      return
    }

    const isPhraseMode = playMode === "phrase"
    const isStage2ListenMode = selectedStage === 2 && playMode === "full"

    if (isPhraseMode && !isStage2ListenMode) {
      if (noteIndex < safeNotes.length - 1) {
        setNoteIndex((prev) => prev + 1)
      } else {
        setIsPlaying(false)
      }
      return
    }

    if (noteIndex < safeNotes.length - 1) {
      setNoteIndex((prev) => prev + 1)
      return
    }

    if (phraseIndex < safePhrases.length - 1) {
      setPhraseIndex((prev) => prev + 1)
      setNoteIndex(0)
      return
    }

    setIsPlaying(false)
  }

  const handleOpenStage = async () => {
    clearPlaybackTimer()
    clearCountdownTimer()
    setCountdown(null)
    setIsPlaying(false)
    await ensureAudioReady()
    setScreen("stageSelect")
    setStageSelectVisible(false)

    window.setTimeout(() => {
      setStageSelectVisible(true)
    }, 30)
  }

  const handleSelectStage = (stageId: StageId) => {
    clearPlaybackTimer()
    clearCountdownTimer()
    setCountdown(null)
    setIsPlaying(false)
    setSelectedStage(stageId)
    setJudgeState("idle")
    setDetectedNote("")
    setDetectedFreq(0)
    setSuccessCount(0)
    setShowNotation(false)
    resetStage6Result()
    setTempoMultiplier(1)

    if (stageId === 1) {
      setPlayMode("phrase")
      setPhraseIndex(0)
      setNoteIndex(0)
      setIsMicEnabled(false)
    } else if (stageId === 2) {
      setPlayMode("full")
      setPhraseIndex(0)
      setNoteIndex(0)
      setIsMicEnabled(false)
    } else if (stageId === 3) {
      setPlayMode("phrase")
      setPhraseIndex(0)
      setNoteIndex(0)
      setIsMicEnabled(false)
    } else if (stageId === 4) {
      setPlayMode("phrase")
      setPhraseIndex(1)
      setNoteIndex(0)
      setIsMicEnabled(false)
    } else if (stageId === 5) {
      setPlayMode("full")
      setPhraseIndex(0)
      setNoteIndex(0)
      setIsMicEnabled(false)
    } else if (stageId === 6) {
      setPlayMode("full")
      setPhraseIndex(0)
      setNoteIndex(0)
      setIsMicEnabled(false)
    }

    setScreen("practice")
  }

  const handleNext = () => {
    clearPlaybackTimer()
    clearCountdownTimer()
    setCountdown(null)
    setIsPlaying(false)
    moveToNextNote()
  }

  const handleBack = () => {
    clearPlaybackTimer()
    clearCountdownTimer()
    setCountdown(null)
    setIsPlaying(false)

    if (selectedStage === 5 || selectedStage === 6) {
      const timingIndex = getFlatTimingIndex(phraseIndex, noteIndex)
      for (let i = timingIndex - 1; i >= 0; i--) {
        if (flatTimingNotes[i].note !== "休符") {
          const prev = flatTimingNotes[i]
          setPhraseIndex(prev.phraseIndex)
          setNoteIndex(prev.noteIndex)
          return
        }
      }
      setPhraseIndex(0)
      setNoteIndex(0)
      return
    }

    if (noteIndex > 0) {
      setNoteIndex((prev) => prev - 1)
      return
    }

    setNoteIndex(0)
  }

  const handleStage3PlayMelody = async () => {
    clearPlaybackTimer()
    clearCountdownTimer()
    setCountdown(null)
    setIsPlaying(false)
    setPlayMode("phrase")
    setPhraseIndex(0)
    setNoteIndex(0)
    setJudgeState("idle")
    await ensureAudioReady()
    setIsPlaying(true)
  }

  const handleStage4PlayMelody = async () => {
    clearPlaybackTimer()
    clearCountdownTimer()
    setCountdown(null)
    setIsPlaying(false)
    setPlayMode("phrase")
    setNoteIndex(0)
    setJudgeState("idle")
    await ensureAudioReady()
    setIsPlaying(true)
  }

  const handleStage5PlayAll = async () => {
    clearPlaybackTimer()
    clearCountdownTimer()
    setCountdown(null)
    setIsPlaying(false)
    setPlayMode("full")
    setPhraseIndex(0)
    setNoteIndex(0)
    setJudgeState("idle")
    await ensureAudioReady()
    setIsPlaying(true)
  }

  const handleStage5JumpToMelody = async (index: number) => {
    clearPlaybackTimer()
    clearCountdownTimer()
    setCountdown(null)
    setIsPlaying(false)
    setPlayMode("full")
    setPhraseIndex(index)
    setNoteIndex(0)
    setJudgeState("idle")
    await ensureAudioReady()
    setIsPlaying(true)
  }

  const handleStage5Resume = async () => {
    clearPlaybackTimer()
    clearCountdownTimer()
    setCountdown(null)
    setIsPlaying(false)
    setPlayMode("full")
    await ensureAudioReady()
    setIsPlaying(true)
  }

  const startMic = async () => {
    if (isMicEnabled) return true

    try {
      setIsMicPreparing(true)

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      })

      const AudioCtx =
        window.AudioContext ||
        (window as typeof window & {
          webkitAudioContext?: typeof AudioContext
        }).webkitAudioContext

      if (!AudioCtx) return false

      const ctx = new AudioCtx()
      const source = ctx.createMediaStreamSource(stream)
      const analyser = ctx.createAnalyser()

      analyser.fftSize = 2048
      analyser.smoothingTimeConstant = 0.1
      source.connect(analyser)

      micStreamRef.current = stream
      micAudioContextRef.current = ctx
      micSourceRef.current = source
      analyserRef.current = analyser

      setIsMicEnabled(true)
      setJudgeState("idle")
      setDetectedNote("")
      setDetectedFreq(0)
      stableHitCountRef.current = 0
      noteSolvedRef.current = false

      return true
    } catch {
      setIsMicEnabled(false)
      return false
    } finally {
      setIsMicPreparing(false)
    }
  }

  const stopMic = () => {
    if (micAnimationRef.current !== null) {
      cancelAnimationFrame(micAnimationRef.current)
      micAnimationRef.current = null
    }

    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((track) => track.stop())
      micStreamRef.current = null
    }

    if (micAudioContextRef.current) {
      void micAudioContextRef.current.close()
      micAudioContextRef.current = null
    }

    analyserRef.current = null
    micSourceRef.current = null
    tuningSamplesRef.current = []
    setIsMicEnabled(false)
    setDetectedNote("")
    setDetectedFreq(0)
    setTuningAverageFreq(0)
    setTuningAverageNote("")
    setTuningLockedFreq(0)
    setTuningLockedNote("")
    setJudgeState("idle")
    stableHitCountRef.current = 0
    noteSolvedRef.current = false
    clearCountdownTimer()
    setCountdown(null)
  }

  const runCountdownThenStart = async () => {
    clearPlaybackTimer()
    clearCountdownTimer()
    setIsPlaying(false)

    const run = (value: number) => {
      setCountdown(value)

      if (value === 0) {
        setCountdown(null)
        playbackStartRef.current = performance.now()
        elapsedBeatsRef.current = 0
        setIsPlaying(true)
        return
      }

      countdownTimerRef.current = window.setTimeout(() => {
        run(value - 1)
      }, 700)
    }

    run(3)
  }

  const handleStage6Start = async () => {
    clearPlaybackTimer()
    clearCountdownTimer()
    setCountdown(null)
    setIsPlaying(false)
    setPlayMode("full")
    setPhraseIndex(0)
    setNoteIndex(0)
    setJudgeState("idle")
    setDetectedNote("")
    setDetectedFreq(0)
    resetStage6Result()
    stableHitCountRef.current = 0
    noteSolvedRef.current = false

    const micOk = await startMic()
    if (!micOk) return

    await ensureAudioReady()
    await runCountdownThenStart()
  }

  const handlePreviewSelect = (item: PreviewItem) => {
    if (item.isPlaceholder) return
    if (item.phraseIndex === undefined || item.noteIndex === undefined) return

    clearPlaybackTimer()
    clearCountdownTimer()
    setCountdown(null)
    setIsPlaying(false)

    setPhraseIndex(item.phraseIndex)
    setNoteIndex(item.noteIndex)
    setJudgeState("idle")
  }

const handleCaptureTuningPoint = () => {
  if (!currentTuningAnchor) return
  if (!tuningLockedNote || tuningLockedFreq <= 0) return

  const roundedFreq = Number(tuningLockedFreq.toFixed(2))
  const guardMessage = getTuningGuardErrorMessage(
    tuningAnchors,
    currentTuningAnchor,
    roundedFreq
  )

  if (guardMessage) {
    setTuningGuardMessage(guardMessage)
    return
  }

  setTuningGuardMessage("")

  setTuningAnchors((prev) =>
    prev.map((item, index) =>
      index === tuningStepIndex
        ? {
            ...item,
            capturedFreq: roundedFreq,
            capturedNote: tuningLockedNote,
          }
        : item
    )
  )

  tuningSamplesRef.current = []
  setTuningAverageFreq(0)
  setTuningAverageNote("")
  setTuningLockedFreq(0)
  setTuningLockedNote("")

  if (tuningStepIndex < tuningAnchors.length - 1) {
    setTuningStepIndex((prev) => prev + 1)
  } else {
    setTuningCompleted(true)
  }
}

const handleResetTuning = () => {
  tuningSamplesRef.current = []
  setTuningAnchors(defaultTuningAnchors)
  setTuningStepIndex(0)
  setTuningCompleted(false)
  setTuningAverageFreq(0)
  setTuningAverageNote("")
  setTuningLockedFreq(0)
  setTuningLockedNote("")
  setTuningGuardMessage("")

  if (typeof window !== "undefined") {
    window.localStorage.removeItem(TUNING_STORAGE_KEY)
  }
}

  useEffect(() => {
    if (typeof window === "undefined") return

    try {
      const raw = window.localStorage.getItem(TUNING_STORAGE_KEY)
      if (!raw) return

      const parsed = JSON.parse(raw) as TuningAnchor[]
      if (!Array.isArray(parsed)) return

      const restored = defaultTuningAnchors.map((base) => {
        const saved = parsed.find((item) => item.id === base.id)
        return saved
          ? {
              ...base,
              capturedFreq:
                typeof saved.capturedFreq === "number"
                  ? saved.capturedFreq
                  : null,
              capturedNote:
                typeof saved.capturedNote === "string"
                  ? saved.capturedNote
                  : "",
            }
          : base
      })

      setTuningAnchors(restored)

      const firstUncapturedIndex = restored.findIndex(
        (item) => item.capturedFreq === null
      )

      if (firstUncapturedIndex === -1) {
        setTuningStepIndex(restored.length - 1)
        setTuningCompleted(true)
      } else {
        setTuningStepIndex(firstUncapturedIndex)
        setTuningCompleted(false)
      }
    } catch {}
  }, [])

  useEffect(() => {
    if (typeof window === "undefined") return

    try {
      window.localStorage.setItem(
        TUNING_STORAGE_KEY,
        JSON.stringify(tuningAnchors)
      )
    } catch {}
  }, [tuningAnchors])

  useEffect(() => {
    if (screen !== "practice") return
    if (![3, 4, 5].includes(selectedStage)) return

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return

      if (e.key === "ArrowLeft") {
        e.preventDefault()
        handleBack()
      }

      if (e.key === "ArrowRight") {
        e.preventDefault()
        handleNext()
      }
    }

    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [screen, selectedStage, phraseIndex, noteIndex])

  useEffect(() => {
    stableHitCountRef.current = 0
    noteSolvedRef.current = false
    setJudgeState("idle")
  }, [phraseIndex, noteIndex])

  useEffect(() => {
    if (screen !== "practice" || selectedStage === 1 || !isPlaying) return
    if (current.note === "休符") return

    if (selectedStage !== 6) {
      // 前の音符がタイでつながっている場合は再アタックしない
      const prevNote = noteIndex > 0 ? safeNotes[noteIndex - 1] : undefined
      const isTiedFrom = prevNote?.tieToNext === true && prevNote?.note === current.note
      if (isTiedFrom) return

      // tieToNext がある場合は次の音も含めた長さで再生する
      const nextNote = noteIndex < safeNotes.length - 1 ? safeNotes[noteIndex + 1] : undefined
      const playLength =
        current.tieToNext && nextNote?.note === current.note
          ? current.length + nextNote.length
          : current.length

      void playNote(current.note, getStepMs(playLength))
    }
  }, [
    screen,
    selectedStage,
    isPlaying,
    phraseIndex,
    noteIndex,
    tempo,
    tempoMultiplier,
    current.note,
    current.length,
    current.tieToNext,
  ])

  // Stage6: 一定テンポでメトロノームを刻む
  useEffect(() => {
    if (screen !== "practice" || selectedStage !== 6 || !isPlaying) {
      stopMetronome()
      return
    }

    const beatMs = 60000 / (STAGE6_TEMPO * tempoMultiplier)
    const startTime = playbackStartRef.current
    let beatCount = 0

    const schedule = () => {
      beatCount++
      const targetTime = startTime + beatCount * beatMs
      const delay = Math.max(0, targetTime - performance.now())
      metronomeBeatRef.current = window.setTimeout(() => {
        void playClick()
        schedule()
      }, delay)
    }

    void playClick()
    schedule()

    return () => stopMetronome()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, selectedStage, isPlaying, tempoMultiplier])

  useEffect(() => {
    if (screen !== "practice" || selectedStage !== 1) return
    if (isMicEnabled || isMicPreparing) return
    if (stage1AutoMicTriedRef.current) return

    stage1AutoMicTriedRef.current = true
    void startMic()
  }, [screen, selectedStage, isMicEnabled, isMicPreparing])

  useEffect(() => {
    if (screen !== "tune") return
    if (isMicEnabled || isMicPreparing) return

    void startMic()
  }, [screen, isMicEnabled, isMicPreparing])

useEffect(() => {
  if (screen !== "tune") return
  tuningSamplesRef.current = []
  setTuningAverageFreq(0)
  setTuningAverageNote("")
  setTuningLockedFreq(0)
  setTuningLockedNote("")
  setTuningGuardMessage("")
}, [screen, tuningStepIndex])

  useEffect(() => {
    clearPlaybackTimer()

    if (screen !== "practice" || selectedStage === 1 || !isPlaying) return

    let delay: number
    if (selectedStage === 6) {
      const base = 60000 / (STAGE6_TEMPO * tempoMultiplier)
      const targetTime = playbackStartRef.current + (elapsedBeatsRef.current + current.length) * base
      delay = Math.max(0, targetTime - performance.now())
    } else {
      delay = getStepMs(current.length)
    }

    const capturedLength = current.length
    timerRef.current = window.setTimeout(() => {
      if (selectedStage === 6) {
        elapsedBeatsRef.current += capturedLength
      }
      moveToNextNote()
    }, delay)

    return () => {
      clearPlaybackTimer()
    }
  }, [
    screen,
    selectedStage,
    isPlaying,
    playMode,
    phraseIndex,
    noteIndex,
    tempo,
    tempoMultiplier,
    current.length,
  ])

  useEffect(() => {
    if (!isMicEnabled || !analyserRef.current || !micAudioContextRef.current) {
      return
    }

    const analyser = analyserRef.current
    const sampleRate = micAudioContextRef.current.sampleRate
    const buffer = new Float32Array(analyser.fftSize)

    const tick = () => {
      analyser.getFloatTimeDomainData(buffer)

      let rms = 0
      for (let i = 0; i < buffer.length; i += 1) {
        rms += buffer[i] * buffer[i]
      }
      rms = Math.sqrt(rms / buffer.length)

      const freq = getAutocorrelatedPitch(buffer, sampleRate)
      const isLoudEnough = rms >= TUNING_MIN_RMS
      const isInOtamatoneRange =
        freq >= TUNING_MIN_FREQ && freq <= TUNING_MAX_FREQ

      const safeFreq =
        isLoudEnough && isInOtamatoneRange && freq > 0 ? freq : 0
      const note = safeFreq > 0 ? closestNoteFromFrequency(safeFreq) : ""

      setDetectedFreq(safeFreq)
      setDetectedNote(note)

      if (screen === "tune") {
        const now = performance.now()

        if (safeFreq > 0 && note) {
          tuningSamplesRef.current = [
            ...tuningSamplesRef.current.filter(
              (item) => now - item.at <= TUNING_AVERAGE_WINDOW_MS
            ),
            { freq: safeFreq, note, at: now },
          ]
        } else {
          tuningSamplesRef.current = tuningSamplesRef.current.filter(
            (item) => now - item.at <= TUNING_AVERAGE_WINDOW_MS
          )
        }

        if (tuningSamplesRef.current.length > 0) {
          const average =
            tuningSamplesRef.current.reduce((sum, item) => sum + item.freq, 0) /
            tuningSamplesRef.current.length

          const noteCountMap = new Map<string, number>()
          for (const item of tuningSamplesRef.current) {
            noteCountMap.set(item.note, (noteCountMap.get(item.note) ?? 0) + 1)
          }

          let dominantNote = ""
          let dominantCount = 0
          for (const [key, value] of noteCountMap.entries()) {
            if (value > dominantCount) {
              dominantNote = key
              dominantCount = value
            }
          }

          setTuningAverageFreq(average)
          setTuningAverageNote(dominantNote || closestNoteFromFrequency(average))

          const isStableEnough =
            tuningSamplesRef.current.length >= TUNING_LOCK_MIN_SAMPLE_COUNT &&
            dominantNote !== "" &&
            dominantCount / tuningSamplesRef.current.length >= 0.7

          if (isStableEnough) {
            setTuningLockedFreq(average)
            setTuningLockedNote(dominantNote)
          }
        } else {
          setTuningAverageFreq(0)
          setTuningAverageNote("")
        }
      }

      if (selectedStage === 1 || screen === "tune") {
        setJudgeState("idle")
      } else if (!isPlaying || current.note === "休符") {
        setJudgeState("idle")
      } else if (!noteSolvedRef.current) {
        if (note && note === current.note) {
          stableHitCountRef.current += 1

          if (stableHitCountRef.current >= 4) {
            noteSolvedRef.current = true
            setJudgeState("ok")

            if (selectedStage === 6) {
              setStage6Score((prev) => prev + 100)
              setStage6Hits((prev) => prev + 1)
              setStage6JudgedCount((prev) => prev + 1)
            } else {
              setSuccessCount((prev) => prev + 1)
            }
          } else {
            setJudgeState("idle")
          }
        } else if (note && note !== current.note) {
          stableHitCountRef.current = 0
          setJudgeState("miss")
        } else {
          setJudgeState("idle")
        }
      } else {
        if (selectedStage !== 6) {
          setJudgeState("ok")
        }
      }

      micAnimationRef.current = requestAnimationFrame(tick)
    }

    micAnimationRef.current = requestAnimationFrame(tick)

    return () => {
      if (micAnimationRef.current !== null) {
        cancelAnimationFrame(micAnimationRef.current)
        micAnimationRef.current = null
      }
    }
  }, [isMicEnabled, isPlaying, current.note, selectedStage, screen])

  useEffect(() => {
    if (selectedStage !== 6) return
    if (!isPlaying) return
    if (noteSolvedRef.current) return
    if (current.note === "休符") return

    const stepMs = getStepMs(current.length)
    const missTimer = window.setTimeout(() => {
      setStage6JudgedCount((prev) => prev + 1)
    }, Math.max(100, stepMs - 60))

    return () => window.clearTimeout(missTimer)
  }, [selectedStage, isPlaying, phraseIndex, noteIndex, current.length])

  useEffect(() => {
    return () => {
      stopMic()
      clearPlaybackTimer()
      clearCountdownTimer()
      stopMetronome()
    }
  }, [])

  useEffect(() => {
    const stored = window.localStorage.getItem(SFC_MODE_KEY)
    if (stored === "true") setIsSfcMode(true)
  }, [])

  useEffect(() => {
    window.localStorage.setItem(SFC_MODE_KEY, String(isSfcMode))
    if (isSfcMode) {
      document.documentElement.classList.add("sfc-mode")
    } else {
      document.documentElement.classList.remove("sfc-mode")
    }
  }, [isSfcMode])

  useEffect(() => {
    if (typeof window === "undefined") return
    try {
      const raw = window.localStorage.getItem(VIRTUAL_TAPE_KEY)
      if (raw === "false") setShowVirtualTape(false)
    } catch {}
  }, [])

  useEffect(() => {
    if (typeof window === "undefined") return
    try {
      window.localStorage.setItem(VIRTUAL_TAPE_KEY, String(showVirtualTape))
    } catch {}
  }, [showVirtualTape])

  useEffect(() => {
    if (typeof window === "undefined") return
    try {
      const raw = window.localStorage.getItem(TEMPO_KEY)
      if (raw === null) return
      const val = Number(raw)
      const match = TEMPO_OPTIONS.find((opt) => opt.value === val)
      if (match) setTempoMultiplier(match.value as TempoMultiplier)
    } catch {}
  }, [])

  useEffect(() => {
    if (typeof window === "undefined") return
    try {
      window.localStorage.setItem(TEMPO_KEY, String(tempoMultiplier))
    } catch {}
  }, [tempoMultiplier])

  if (screen === "home") {
    return (
      <main className="relative flex min-h-screen items-center justify-center bg-[#0A1F52] px-6 py-8 text-white">
        <div className="w-full max-w-[860px] rounded-[36px] border border-white/10 bg-[#102A68] px-8 py-10 text-center shadow-[0_20px_50px_rgba(0,0,0,0.28)]">
          <div className="mx-auto flex max-w-[560px] flex-col items-center">
            <div className="flex flex-col items-center animate-fadeIn">
              <p
                className={`${cinzel.className} bg-gradient-to-b from-white to-white/75 bg-clip-text text-[clamp(44px,9vw,88px)] font-black leading-none tracking-[0.08em] text-transparent`}
              >
                EIGHT MELODIES
              </p>

              <p
                className={`${cinzel.className} mt-4 text-[clamp(14px,2vw,20px)] font-bold tracking-[0.35em] text-white/85`}
              >
                FOR OTAMATONE
              </p>

              <img
                src="/otamatone-logo.svg"
                alt="Otamatone"
                width={80}
                height={80}
                className="mt-3 opacity-70"
              />

              <div className="mt-4 h-[3px] w-[min(48vw,300px)] rounded-full bg-white/70" />
            </div>

            <p className="mt-8 text-sm font-bold leading-relaxed text-white/90 md:text-base">
              すこしずつ　音をならして、
              <br />
              さいごは　とおしで　ひいてみよう
            </p>

            {isPreparingAudio && (
              <div className="mt-6 flex items-center justify-center gap-2 rounded-[18px] bg-white/10 px-5 py-3 text-sm font-bold">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                音を準備しています…
              </div>
            )}

            <div className="mt-8">
              <button
                onClick={() => {
                  if (isPreparingAudio) return

                  void (async () => {
                    await playClick()
                    setIsFading(true)

                    window.setTimeout(() => {
                      void handleOpenStage()
                      setIsFading(false)
                    }, 300)
                  })()
                }}
                className="min-w-[220px] rounded-[24px] border-b-4 border-[#D6A800] bg-[#FFD54A] px-8 py-4 text-xl font-black text-[#1F325C] shadow-[0_8px_20px_rgba(0,0,0,0.22)] transition hover:translate-y-[1px] disabled:opacity-70"
                disabled={isPreparingAudio}
              >
                {isPreparingAudio ? "準備中…" : "START"}
              </button>
            </div>

            <p className="mt-6 text-[11px] font-bold tracking-[0.12em] text-white/45">
              UNOFFICIAL PRACTICE APP
            </p>

            <div className="mt-5">
              <SfcModeToggle
                isOn={isSfcMode}
                onToggle={() => setIsSfcMode((v) => !v)}
                variant="dark"
              />
            </div>
          </div>
        </div>

        <div
          className={`fixed inset-0 bg-black pointer-events-none transition-opacity duration-300 ${
            isFading ? "opacity-100" : "opacity-0"
          }`}
        />
      </main>
    )
  }

  if (screen === "stageSelect") {
    return (
      <main className="min-h-screen bg-[#10234d] px-4 py-6 text-white">
        <div
          className={`mx-auto flex max-w-[900px] flex-col gap-4 transition-opacity duration-300 ${
            stageSelectVisible ? "opacity-100" : "opacity-0"
          }`}
        >
          <section className="mother-panel px-6 py-6 text-slate-900">
            <div className="flex flex-col items-center text-center">
              <h1 className="mother-text-main text-2xl font-black md:text-3xl">
                どこからやってみる？
              </h1>
            </div>

            <div className="mt-8 flex flex-col gap-4">
              {stages.map((stage) => (
                <button
                  key={stage.id}
                  type="button"
                  onClick={() => handleSelectStage(stage.id)}
                  className="relative w-full rounded-[20px] bg-[#fffdf8] px-7 py-5 text-left border-2 border-[#d8d0bc] shadow-[0_4px_0_#c4bbab,0_2px_12px_rgba(0,0,0,0.08)] transition hover:-translate-y-[2px] hover:border-[#3F8CFF] hover:shadow-[0_8px_20px_rgba(63,140,255,0.18)]"
                >
                  <div className="flex items-center gap-4">
                    <div className="shrink-0 inline-flex items-center rounded-full bg-[#3F8CFF] px-2.5 py-0.5">
                      <span className="text-xs font-black tracking-widest text-white">STAGE {stage.id}</span>
                    </div>
                    <p className="mother-text-main text-lg font-black leading-tight">
                      {stage.title}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </section>

          <section className="mother-panel px-6 py-5 text-slate-900">
            <div className="flex flex-col items-center justify-between gap-4 md:flex-row">
              <div className="flex items-center gap-3">
                <PixelInventorFace />
                <div>
                  <p className="mother-text-main text-sm font-bold">
                    あなたのオタマトーンにあわせる
                  </p>
                  <p className="text-xs font-bold text-slate-500">
                    音の位置を合わせたいときに使います
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setScreen("tune")}
                  className="mother-button-light px-5 py-3 text-sm font-bold"
                >
                  調整してみる
                </button>
                <SfcModeToggle
                  isOn={isSfcMode}
                  onToggle={() => setIsSfcMode((v) => !v)}
                  variant="light"
                />
              </div>
            </div>
          </section>
        </div>
      </main>
    )
  }

  if (screen === "tune") {
    return (
      <main className="min-h-screen bg-[#10234d] px-4 py-6 text-white">
        <div className="mx-auto flex max-w-[900px] flex-col gap-4">
          <section className="mother-panel px-6 py-6 text-slate-900">
            <div className="flex items-center gap-3">
              <PixelInventorFace />
              <div>
                <p className="mother-text-soft text-[11px] font-black tracking-wide">
                  TUNING
                </p>
                <p className="mother-text-main text-base font-bold">
                  あなたのオタマトーンにあわせる
                </p>
              </div>
            </div>

            <div className="mother-subpanel mt-5 px-5 py-5 text-center">
              <p className="mother-text-main text-sm font-bold">
                1か所ずつ音の位置を記録していきます
              </p>
              <p className="mt-2 text-xs font-bold leading-relaxed text-slate-500">
                マイクは自動でONになります。
                <br />
                指示された位置を押さえて音を出し、「この位置をきろくする」を押してください。
              </p>
            </div>

            <div className="mt-5 rounded-[20px] bg-white/70 px-4 py-4">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-sm font-black text-slate-700">進みぐあい</p>
                <p className="text-xs font-bold text-slate-500">
                  {tuningCompleted
                    ? `${tuningAnchors.length} / ${tuningAnchors.length}`
                    : `${Math.min(tuningStepIndex + 1, tuningAnchors.length)} / ${tuningAnchors.length}`}
                </p>
              </div>

              <div className="h-3 w-full overflow-hidden rounded-full bg-slate-200">
                <div
                  className="h-full rounded-full bg-[#3F8CFF] transition-all"
                  style={{
                    width: `${tuningCompleted ? 100 : ((tuningStepIndex + 1) / tuningAnchors.length) * 100}%`,
                  }}
                />
              </div>
            </div>

            {!tuningCompleted && currentTuningAnchor && (
              <div className="mt-5 grid gap-4 md:grid-cols-[1fr_1fr]">
                <div className="mother-subpanel flex items-center justify-center p-4">
                  <div className="flex h-full w-full flex-col items-center justify-center">
                    <p className="text-[11px] font-black tracking-wide text-[#3F8CFF]">
                      STEP {tuningStepIndex + 1}
                    </p>

                    <p className="mt-3 text-base font-black text-slate-800">
                      {tuningStepIndex === 0
                        ? "まずはここです"
                        : tuningStepIndex === 4
                        ? "最後はここです"
                        : "つぎはここです"}
                    </p>

                    <p className="mt-3 text-center text-xl font-black leading-relaxed text-slate-900">
                      {currentTuningAnchor.label}
                    </p>

                    <div className="mt-6 relative flex h-[360px] w-[170px] items-end justify-center rounded-full bg-[#f3ead1] px-4 py-5">
                      <div className="mother-neck relative h-full w-10 rounded-full">
                        <div className="absolute inset-x-0 bottom-0 top-0 flex flex-col justify-between py-4">
                          {Array.from({ length: 9 }).map((_, i) => (
                            <div key={i} className="h-px w-full bg-white/10" />
                          ))}
                        </div>

                        <div
                          className="mother-indicator-current absolute left-1/2 h-3.5 w-16 -translate-x-1/2 rounded-full"
                          style={{
                            top: `clamp(8px, calc(${normalizeToVisiblePercent(currentTuningAnchor.pos)}% - 7px), calc(100% - 22px))`,
                          }}
                        />
                      </div>

                      <div className="absolute bottom-0 left-1/2 h-[82px] w-[96px] -translate-x-1/2 translate-y-6 rounded-[46%] border-4 border-slate-700 bg-[#fffaf0]">
                        <div className="absolute left-[27px] top-[24px] h-[8px] w-[8px] rounded-full bg-slate-700" />
                        <div className="absolute right-[27px] top-[24px] h-[8px] w-[8px] rounded-full bg-slate-700" />
                        <div className="absolute left-0 top-[42px] h-[2px] w-full bg-slate-700" />
                      </div>
                    </div>

                    <p className="mt-8 text-center text-xs font-bold leading-relaxed text-slate-500">
                      光っている位置を押さえて、
                      <br />
                      安定した音を少し出してください
                    </p>
                  </div>
                </div>

                <div className="flex flex-col gap-4">
                  <div className="mother-display-blue flex min-h-[220px] flex-col items-center justify-center px-5 py-6 text-center">
                    <p className="text-sm font-bold text-slate-600">最新の入力音</p>
                    <p className="mt-3 min-h-[44px] text-4xl font-black leading-none text-slate-900">
                      {detectedNote || "-"}
                    </p>
                    <p className="mt-2 text-sm font-bold text-slate-600">
                      {detectedFreq > 0 ? `${detectedFreq.toFixed(2)} Hz` : ""}
                    </p>

                    <div className="mt-4 h-px w-24 bg-slate-300" />

                    <p className="mt-4 text-sm font-bold text-slate-600">
                      平均の候補
                    </p>
                    <p className="mt-3 min-h-[44px] text-4xl font-black leading-none text-[#1F325C]">
                      {tuningAverageNote || "-"}
                    </p>
                    <p className="mt-2 text-sm font-bold text-slate-600">
                      {tuningAverageFreq > 0
                        ? `${tuningAverageFreq.toFixed(2)} Hz`
                        : ""}
                    </p>

                    <div className="mt-4 h-px w-24 bg-slate-300" />

                    <p className="mt-4 text-sm font-bold text-slate-600">
                      記録する音
                    </p>
                    <p className="mt-3 min-h-[44px] text-4xl font-black leading-none text-[#1F325C]">
                      {tuningLockedNote || "-"}
                    </p>
                    <p className="mt-2 text-sm font-bold text-slate-600">
                      {tuningLockedFreq > 0
                        ? `${tuningLockedFreq.toFixed(2)} Hz`
                        : ""}
                    </p>

                    <p className="mt-3 text-[11px] font-bold text-slate-500">
                      安定した平均音だけを保持します
                    </p>
                  </div>

                  <div className="mother-settings-card p-4">
<div className="grid gap-3">
  <button
    type="button"
    onClick={handleCaptureTuningPoint}
    disabled={!isMicEnabled || !tuningLockedNote || tuningLockedFreq <= 0}
    className="mother-button-blue w-full px-4 py-3 text-base font-bold disabled:opacity-50"
  >
    この位置をきろくする
  </button>

  {/* 👇 ここを追加 */}
  {tuningGuardMessage && (
    <p className="text-xs font-bold text-red-500 text-center">
      {tuningGuardMessage}
    </p>
  )}

  <button
    type="button"
    onClick={() => {
      if (isMicEnabled) {
        stopMic()
      } else {
        void startMic()
      }
    }}
    className="mother-button-light w-full px-4 py-3 text-sm font-bold"
  >
    {isMicPreparing
      ? "マイク準備中…"
      : isMicEnabled
      ? "マイクをとめる"
      : "マイクをつかう"}
  </button>

  <button
    type="button"
    onClick={handleResetTuning}
    className="mother-button-light w-full px-4 py-3 text-sm font-bold"
  >
    最初からやりなおす
  </button>
</div>

                    <div className="mt-4 rounded-[18px] bg-white/70 px-4 py-3 text-center">
                      <p className="text-xs font-bold leading-relaxed text-slate-500">
                        小さな生活音や音域外の音は無視します。
                        <br />
                        安定した値だけを記録候補として保持します。
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {tuningCompleted && (
              <div className="mt-5 flex flex-col gap-4">
                <div className="mother-display-blue flex min-h-[180px] flex-col items-center justify-center px-5 py-6 text-center">
                  <p className="text-sm font-bold text-slate-600">
                    チューニング完了
                  </p>
                  <p className="mt-3 text-3xl font-black leading-relaxed text-slate-900">
                    5か所の記録ができました
                  </p>
                  <p className="mt-3 text-xs font-bold leading-relaxed text-slate-500">
                    この端末に保存されています
                  </p>
                </div>

                <div className="grid gap-3 md:grid-cols-5">
                  {tuningAnchors.map((anchor, index) => (
                    <div
                      key={anchor.id}
                      className="mother-white-panel flex min-h-[130px] flex-col items-center justify-center px-3 py-4 text-center"
                    >
                      <p className="text-[10px] font-black tracking-wide text-[#3F8CFF]">
                        POINT {index + 1}
                      </p>
                      <p className="mt-2 text-xs font-black leading-relaxed text-slate-700">
                        {anchor.label}
                      </p>
                      <p className="mt-2 text-base font-black text-slate-900">
                        {anchor.capturedNote || "-"}
                      </p>
                      <p className="text-[11px] font-bold text-slate-500">
                        {anchor.capturedFreq
                          ? `${anchor.capturedFreq.toFixed(2)} Hz`
                          : "未記録"}
                      </p>
                    </div>
                  ))}
                </div>

                <div className="mother-settings-card p-4">
                  <div className="grid gap-3 md:grid-cols-2">
                    <button
                      type="button"
                      onClick={handleResetTuning}
                      className="mother-button-light w-full px-4 py-3 text-sm font-bold"
                    >
                      もう一度チューニングする
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        stopMic()
                        setScreen("stageSelect")
                      }}
                      className="mother-button-blue w-full px-4 py-3 text-sm font-bold"
                    >
                      ステージ選択へ
                    </button>
                  </div>
                </div>
              </div>
            )}
          </section>

          <div className="flex justify-center gap-3">
            <button
              type="button"
              onClick={() => {
                stopMic()
                setScreen("stageSelect")
              }}
              className="mother-button-light px-5 py-3 text-sm font-bold"
            >
              ステージ選択へ
            </button>

            <button
              type="button"
              onClick={() => {
                stopMic()
                setScreen("home")
              }}
              className="mother-button-light px-5 py-3 text-sm font-bold"
            >
              ホームへ
            </button>
          </div>
        </div>
      </main>
    )
  }

  if (selectedStage === 1) {
    return (
      <main className="min-h-screen bg-[#10234d] px-4 py-4 text-white">
        <div className="mx-auto flex max-w-[980px] flex-col gap-3">
          <section className="mother-panel flex flex-col p-4 text-slate-900">
            <div className="mb-3 flex items-center gap-3">
              <PixelInventorFace />
              <div>
                <p className="mother-text-soft text-[11px] font-black tracking-wide">
                  STAGE {selectedStage}
                </p>
                <p className="mother-text-main text-base font-bold">
                  {stageLabel}
                </p>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-[1.1fr_0.9fr]">
              <div className="flex items-center justify-center py-4">
                  <div className="relative flex h-[min(62vh,620px)] w-[200px] items-end justify-center rounded-full bg-[#f3ead1] px-5 py-6">
                    <div className="mother-neck relative h-full w-12 rounded-full">
                      <div className="absolute inset-x-0 bottom-0 top-0 flex flex-col justify-between py-4">
                        {Array.from({ length: 11 }).map((_, i) => (
                          <div key={i} className="h-px w-full bg-white/10" />
                        ))}
                      </div>

                      {stage1IndicatorTop !== null && (
                        <div
                          className="mother-indicator-current absolute left-1/2 h-3.5 w-16 -translate-x-1/2 rounded-full"
                          style={{
                            top: `clamp(8px, calc(${stage1IndicatorTop}% - 7px), calc(100% - 22px))`,
                          }}
                        />
                      )}

                      {showVirtualTape && <VirtualTape />}
                    </div>

                    <div className="absolute bottom-0 left-1/2 h-[96px] w-[112px] -translate-x-1/2 translate-y-6 rounded-[46%] border-4 border-slate-700 bg-[#fffaf0]">
                      <div className="absolute left-[31px] top-[28px] h-[8px] w-[8px] rounded-full bg-slate-700" />
                      <div className="absolute right-[31px] top-[28px] h-[8px] w-[8px] rounded-full bg-slate-700" />
                      <div className="absolute left-0 top-[48px] h-[2px] w-full bg-slate-700" />
                    </div>
                  </div>
              </div>

              <div className="flex flex-col gap-4">
                <div className="mother-display-blue flex min-h-[220px] flex-col items-center justify-center px-5 py-6 text-center">
                  <p className="text-sm font-bold text-slate-600">いまの音</p>
                  <p className="mt-3 min-h-[72px] text-5xl font-black leading-none text-slate-900">
                    {detectedNote || "-"}
                  </p>
                  <p className="mt-3 text-sm font-bold text-slate-600">
                    {detectedFreq > 0 ? `${detectedFreq.toFixed(2)} Hz` : ""}
                  </p>
                </div>

                <div className="rounded-[20px] border border-[#e8e0c8] bg-[#fffdf0] px-4 py-4">
                  <p className="text-xs font-black tracking-wide text-[#b09050]">
                    Tips：音が分からなくても大丈夫
                  </p>
                  <p className="mt-2 text-xs leading-relaxed text-slate-600">
                    オタマトーンは音の位置が分かりづらいですよね。
                    <br />
                    最初は「テープ」を貼って、ドレミを書いてしまうのがおすすめです。
                    <br />
                    まずは「ド・レ・ミ」の3つだけでも目印にしてみましょう。
                  </p>
                  <div className="mt-3 flex items-center gap-3">
                    <span className="text-xs text-slate-500">仮想テープ：</span>
                    <button
                      type="button"
                      onClick={() => setShowVirtualTape((v) => !v)}
                      className="rounded-full border px-4 py-1.5 text-xs font-bold transition"
                      style={
                        showVirtualTape
                          ? { background: "#f5f0e0", borderColor: "#c8a840", color: "#7a6020" }
                          : { background: "#f0f0f0", borderColor: "#d0d0d0", color: "#888888" }
                      }
                    >
                      {showVirtualTape ? "仮想テープをかくす" : "仮想テープを表示"}
                    </button>
                  </div>
                </div>

                <div className="mother-settings-card p-4">
                  <p className="mother-text-main mb-3 text-base font-bold">
                    ひょうじ
                  </p>

                  <button
                    type="button"
                    onClick={() => {
                      if (isMicEnabled) {
                        stopMic()
                      } else {
                        void startMic()
                      }
                    }}
                    className="mother-button-blue w-full px-4 py-3 text-base font-bold"
                  >
                    <span className="flex items-center justify-center gap-2">
                      {isMicPreparing && <Spinner />}
                      {isMicPreparing
                        ? "準備中…"
                        : isMicEnabled
                        ? "マイクをとめる"
                        : "マイクをつかう"}
                    </span>
                  </button>

                  <div className="mt-3 rounded-[18px] bg-white/70 px-4 py-3 text-center">
                    <p className="text-xs font-bold text-slate-500">
                      {isMicEnabled
                        ? "音が鳴ると、音名と位置が見えます。"
                        : "マイクをONにすると、音名が見えます。"}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="mother-subpanel mt-4 flex flex-col items-center gap-3 px-5 py-5 text-center">
              <div className="flex items-center gap-3">
                <PixelInventorFace />
                <p className="mother-text-main text-sm font-bold">
                  ひととおりならしたら　ステージ選択にもどってよ
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  clearPlaybackTimer()
                  clearCountdownTimer()
                  setCountdown(null)
                  setIsPlaying(false)
                  stage1AutoMicTriedRef.current = false
                  stopMic()
                  setScreen("stageSelect")
                }}
                className="mother-button-light px-5 py-3 text-sm font-bold"
              >
                ステージ選択へ
              </button>
            </div>
          </section>
        </div>
      </main>
    )
  }

if (selectedStage === 2) {
  return (
    <main className="min-h-screen bg-[#10234d] px-4 py-3 text-white">
      <div className="mx-auto flex max-w-[980px] flex-col gap-2">
        <section className="mother-panel flex flex-col p-3 text-slate-900">
          <div className="mb-2 flex items-center gap-3">
            <PixelInventorFace />
            <div>
              <p className="mother-text-soft text-[11px] font-black tracking-wide">
                STAGE {selectedStage}
              </p>
              <p className="mother-text-main text-base font-bold">
                {stageLabel}
              </p>
            </div>
          </div>

          <div className="mother-white-panel mb-3 p-3">
            <div className="mb-2 flex items-center justify-center gap-4">
              <p className="mother-text-soft text-base font-bold">
                いまのメロディー
              </p>
              <p className="mother-text-main text-base font-black">
                {phraseIndex + 1} / {safePhrases.length}
              </p>
            </div>

            <div className="grid grid-cols-8 gap-2">
              {safePhrases.map((_, index) => {
                const isCurrent = index === phraseIndex
                const isDone = index < phraseIndex

                return (
                  <div
                    key={index}
                    className={`mother-step-card px-2 py-2 text-center ${
                      isCurrent
                        ? "is-active"
                        : isDone
                        ? "bg-[#eaf4ff] text-slate-900"
                        : "text-slate-500"
                    }`}
                  >
                    <p className="hidden text-[9px] font-bold md:block">MELODY</p>
                    <p className="mt-1 text-xl font-black">{index + 1}</p>
                  </div>
                )
              })}
            </div>

            <div className="mother-progress-track mt-3 h-2.5 w-full overflow-hidden">
              <div
                className="mother-progress-fill h-full transition-all"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-[0.95fr_1.05fr]">
            <div className="flex items-center justify-center py-3">
              <div className="relative flex h-[min(48vh,400px)] w-[140px] items-end justify-center rounded-full bg-[#f3ead1] px-4 py-4">
                <div className="mother-neck relative h-full w-10 rounded-full">
                  <div className="absolute inset-x-0 bottom-0 top-0 flex flex-col justify-between py-4">
                    {Array.from({ length: 9 }).map((_, i) => (
                      <div key={i} className="h-px w-full bg-white/10" />
                    ))}
                  </div>

                  {current.note !== "休符" && currentIndicatorTop !== null && (
                    <div
                      className="mother-indicator-current absolute left-1/2 h-3 w-14 -translate-x-1/2 rounded-full"
                      style={{
                        top: `clamp(8px, calc(${currentIndicatorTop}% - 6px), calc(100% - 20px))`,
                      }}
                    />
                  )}

                  {showVirtualTape && <VirtualTape />}
                </div>

                <div className="absolute bottom-0 left-1/2 h-[82px] w-[96px] -translate-x-1/2 translate-y-6 rounded-[46%] border-4 border-slate-700 bg-[#fffaf0]">
                  <div className="absolute left-[27px] top-[24px] h-[8px] w-[8px] rounded-full bg-slate-700" />
                  <div className="absolute right-[27px] top-[24px] h-[8px] w-[8px] rounded-full bg-slate-700" />
                  <div className="absolute left-0 top-[42px] h-[2px] w-full bg-slate-700" />
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-3">
              <div className="mother-settings-card p-3">
                <p className="mother-text-main mb-2 text-base font-bold">
                  まずは全体をきいて、イメージをもちましょう。
                </p>

                <div className="grid grid-cols-1 gap-2">
                  <button
                    onClick={() => void ensureAudioReady().then(() => setIsPlaying(true))}
                    className="mother-button-blue px-4 py-2.5 text-lg font-bold disabled:opacity-70"
                  >
                    <span className="flex items-center justify-center gap-2">
                      {isPreparingAudio && <Spinner />}
                      {isPreparingAudio
                        ? "準備中…"
                        : isPlaying
                        ? "再生中…"
                        : "きいてみる"}
                    </span>
                  </button>

                  <button
                    onClick={() => {
                      clearPlaybackTimer()
                      clearCountdownTimer()
                      setCountdown(null)
                      setIsPlaying(false)
                    }}
                    className="mother-button-light px-4 py-2.5 text-base font-bold"
                  >
                    とめる
                  </button>
                </div>

                <div className="mt-2 flex items-center justify-end gap-2">
                  <span className="text-[11px] font-bold text-slate-400">テープ：</span>
                  <button
                    type="button"
                    onClick={() => setShowVirtualTape((v) => !v)}
                    className={`rounded-full px-2.5 py-1 text-[11px] font-bold transition ${showVirtualTape ? "bg-[#eef7e8] text-[#3a7a30]" : "bg-slate-100 text-slate-400"}`}
                  >
                    ON
                  </button>
                  <span className="text-[10px] text-slate-300">/</span>
                  <button
                    type="button"
                    onClick={() => setShowVirtualTape((v) => !v)}
                    className={`rounded-full px-2.5 py-1 text-[11px] font-bold transition ${!showVirtualTape ? "bg-[#f5e8e8] text-[#7a3030]" : "bg-slate-100 text-slate-400"}`}
                  >
                    OFF
                  </button>
                </div>
              </div>

              <div className="mother-display-blue flex min-h-[190px] flex-col items-center justify-center px-5 py-5 text-center">
                <p className="text-sm font-bold text-slate-600">今聞いている音</p>
                <p className="mt-2 min-h-[60px] text-5xl font-black leading-none text-slate-900">
                  {current.note === "休符" ? "-" : current.note}
                </p>
                <p className="mt-2 text-sm font-bold text-slate-600">
                  {safePhrases[phraseIndex]?.title ?? ""}
                </p>
              </div>
            </div>
          </div>

          <div className="mother-subpanel mt-3 flex flex-col items-center gap-2 px-5 py-4 text-center">
            <div className="flex items-center gap-3">
              <PixelInventorFace />
              <p className="mother-text-main text-sm font-bold">
                ひととおりきいたら　ステージ選択にもどってよ
              </p>
            </div>

            <button
              type="button"
              onClick={() => {
                clearPlaybackTimer()
                clearCountdownTimer()
                setCountdown(null)
                setIsPlaying(false)
                setScreen("stageSelect")
              }}
              className="mother-button-light px-5 py-2.5 text-sm font-bold"
            >
              ステージ選択へ
            </button>
          </div>
        </section>
      </div>
    </main>
  )
}

  if (selectedStage === 3) {
    return (
      <main className="min-h-screen bg-[#10234d] px-4 py-4 text-white">
        <div className="mx-auto flex max-w-[1180px] flex-col gap-3">
          <section className="mother-panel flex flex-col p-4 text-slate-900">
            <div className="mb-3 flex items-center gap-3">
              <PixelInventorFace />
              <div>
                <p className="mother-text-soft text-[11px] font-black tracking-wide">
                  STAGE {selectedStage}
                </p>
                <p className="mother-text-main text-base font-bold">
                  ひとつめのメロディーをひいてみて
                </p>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-[0.38fr_0.62fr]">
              <div className="flex items-center justify-center py-4">
                <div className="relative flex h-[min(56vh,500px)] w-[160px] items-end justify-center rounded-full bg-[#f3ead1] px-4 py-5">
                  <div className="mother-neck relative h-full w-10 rounded-full">
                    <div className="absolute inset-x-0 bottom-0 top-0 flex flex-col justify-between py-4">
                      {Array.from({ length: 9 }).map((_, i) => (
                        <div key={i} className="h-px w-full bg-white/10" />
                      ))}
                    </div>

                    {nextVisibleNote?.note !== "休符" && nextIndicatorTop !== null && (
                      <div
                        className="mother-indicator-next absolute left-1/2 h-2.5 w-11 -translate-x-1/2 rounded-full"
                        style={{
                          top: `clamp(8px, calc(${nextIndicatorTop}% - 5px), calc(100% - 18px))`,
                          marginLeft: indicatorsAreClose ? "26px" : "0px",
                        }}
                      />
                    )}

                    {current.note !== "休符" && currentIndicatorTop !== null && (
                      <div
                        className="mother-indicator-current absolute left-1/2 h-3 w-14 -translate-x-1/2 rounded-full"
                        style={{
                          top: `clamp(8px, calc(${currentIndicatorTop}% - 6px), calc(100% - 20px))`,
                        }}
                      />
                    )}

                    {showVirtualTape && <VirtualTape />}
                  </div>

                  <div className="absolute bottom-0 left-1/2 h-[82px] w-[96px] -translate-x-1/2 translate-y-6 rounded-[46%] border-4 border-slate-700 bg-[#fffaf0]">
                    <div className="absolute left-[27px] top-[24px] h-[8px] w-[8px] rounded-full bg-slate-700" />
                    <div className="absolute right-[27px] top-[24px] h-[8px] w-[8px] rounded-full bg-slate-700" />
                    <div className="absolute left-0 top-[42px] h-[2px] w-full bg-slate-700" />
                  </div>
                </div>
              </div>

              <div className="flex min-w-0 flex-col gap-4">
                <PreviewLane
                  items={previewItems}
                  onSelect={handlePreviewSelect}
                  showNotation={showNotation}
                  onToggleNotation={setShowNotation}
                />

                <div className="mother-subpanel flex min-h-[148px] flex-col gap-4 px-5 py-5">
                  <div className="flex items-center justify-between">
                    <p className="mother-text-soft text-center text-sm font-bold">
                      メロディー1 をれんしゅう中
                    </p>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] font-bold text-slate-400">テープ：</span>
                      <button
                        type="button"
                        onClick={() => setShowVirtualTape((v) => !v)}
                        className={`rounded-full px-2 py-0.5 text-[11px] font-bold transition ${showVirtualTape ? "bg-[#eef7e8] text-[#3a7a30]" : "bg-slate-100 text-slate-400"}`}
                      >
                        ON
                      </button>
                      <span className="text-[10px] text-slate-300">/</span>
                      <button
                        type="button"
                        onClick={() => setShowVirtualTape((v) => !v)}
                        className={`rounded-full px-2 py-0.5 text-[11px] font-bold transition ${!showVirtualTape ? "bg-[#f5e8e8] text-[#7a3030]" : "bg-slate-100 text-slate-400"}`}
                      >
                        OFF
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-center gap-3">
                    <div className="flex items-center gap-3">
                      <button
                        onClick={handleBack}
                        className="mother-button-light px-4 py-2 text-sm font-semibold"
                      >
                        1音戻る
                      </button>

                      <button
                        onClick={handleNext}
                        className="mother-button-light px-4 py-2 text-sm font-semibold"
                      >
                        1音進む
                      </button>
                    </div>

                    <button
                      onClick={() => void playCurrentNote()}
                      className="mother-button-blue px-4 py-2 text-sm font-semibold"
                    >
                      お手本
                    </button>

                    <button
                      onClick={() => {
                        if (isPlaying) {
                          clearPlaybackTimer()
                          clearCountdownTimer()
                          setCountdown(null)
                          setIsPlaying(false)
                        } else {
                          void handleStage3PlayMelody()
                        }
                      }}
                      className="mother-button-blue px-4 py-2 text-sm font-semibold"
                    >
                      {isPlaying ? "とめる" : "このメロディーを再生"}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="mother-subpanel mt-4 flex flex-col items-center gap-3 px-5 py-5 text-center">
              <div className="flex items-center gap-3">
                <PixelInventorFace />
                <p className="mother-text-main text-sm font-bold">
                  ひととおりひいたら　ステージ選択にもどってよ
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  clearPlaybackTimer()
                  clearCountdownTimer()
                  setCountdown(null)
                  setIsPlaying(false)
                  setScreen("stageSelect")
                }}
                className="mother-button-light px-5 py-3 text-sm font-bold"
              >
                ステージ選択へ
              </button>
            </div>
          </section>
        </div>
      </main>
    )
  }

  if (selectedStage === 4) {
    return (
      <main className="min-h-screen bg-[#10234d] px-4 py-4 text-white">
        <div className="mx-auto flex max-w-[1240px] flex-col gap-3">
          <section className="mother-panel flex flex-col p-4 text-slate-900">
            <div className="mb-3 flex items-center gap-3">
              <PixelInventorFace />
              <div>
                <p className="mother-text-soft text-[11px] font-black tracking-wide">
                  STAGE {selectedStage}
                </p>
                <p className="mother-text-main text-base font-bold">
                  ほかのメロディーもひいてみてよ
                </p>
              </div>
            </div>

            <div className="mother-subpanel px-4 py-3">
              <div className="mb-3 flex items-center justify-between">
                <p className="mother-text-main text-sm font-bold">メロディーをえらぶ</p>
                <p className="mother-text-soft text-xs font-bold">
                  いまは {phraseIndex + 1} 番
                </p>
              </div>

              <div className="grid grid-cols-4 gap-3 md:grid-cols-8">
                {safePhrases.map((_, index) => {
                  const isCurrent = index === phraseIndex

                  return (
                    <button
                      key={index}
                      type="button"
                      onClick={() => {
                        clearPlaybackTimer()
                        clearCountdownTimer()
                        setCountdown(null)
                        setIsPlaying(false)
                        setPlayMode("phrase")
                        setPhraseIndex(index)
                        setNoteIndex(0)
                        setJudgeState("idle")
                      }}
                      className={`rounded-[18px] px-3 py-3 text-center font-black transition ${
                        isCurrent
                          ? "mother-step-card is-active"
                          : "mother-step-card text-slate-600"
                      }`}
                    >
                      <p className="hidden text-[10px] font-bold md:block">MELODY</p>
                      <p className="mt-1 text-xl">{index + 1}</p>
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="mt-3 grid gap-3 md:grid-cols-[0.38fr_0.62fr]">
              <div className="flex items-center justify-center py-4">
                <div className="relative flex h-[min(50vh,440px)] w-[150px] items-end justify-center rounded-full bg-[#f3ead1] px-4 py-4">
                  <div className="mother-neck relative h-full w-10 rounded-full">
                    <div className="absolute inset-x-0 bottom-0 top-0 flex flex-col justify-between py-4">
                      {Array.from({ length: 9 }).map((_, i) => (
                        <div key={i} className="h-px w-full bg-white/10" />
                      ))}
                    </div>

                    {nextVisibleNote?.note !== "休符" && nextIndicatorTop !== null && (
                      <div
                        className="mother-indicator-next absolute left-1/2 h-2.5 w-11 -translate-x-1/2 rounded-full"
                        style={{
                          top: `clamp(8px, calc(${nextIndicatorTop}% - 5px), calc(100% - 18px))`,
                          marginLeft: indicatorsAreClose ? "26px" : "0px",
                        }}
                      />
                    )}

                    {current.note !== "休符" && currentIndicatorTop !== null && (
                      <div
                        className="mother-indicator-current absolute left-1/2 h-3 w-14 -translate-x-1/2 rounded-full"
                        style={{
                          top: `clamp(8px, calc(${currentIndicatorTop}% - 6px), calc(100% - 20px))`,
                        }}
                      />
                    )}

                    {showVirtualTape && <VirtualTape />}
                  </div>

                  <div className="absolute bottom-0 left-1/2 h-[82px] w-[96px] -translate-x-1/2 translate-y-6 rounded-[46%] border-4 border-slate-700 bg-[#fffaf0]">
                    <div className="absolute left-[27px] top-[24px] h-[8px] w-[8px] rounded-full bg-slate-700" />
                    <div className="absolute right-[27px] top-[24px] h-[8px] w-[8px] rounded-full bg-slate-700" />
                    <div className="absolute left-0 top-[42px] h-[2px] w-full bg-slate-700" />
                  </div>
                </div>
              </div>

              <div className="flex min-w-0 flex-col gap-4">
                <PreviewLane
                  items={previewItems}
                  onSelect={handlePreviewSelect}
                  showNotation={showNotation}
                  onToggleNotation={setShowNotation}
                />

                <div className="mother-subpanel flex min-h-[126px] flex-col gap-3 px-4 py-4">
                  <div className="flex items-center justify-between">
                    <p className="mother-text-soft text-center text-sm font-bold">
                      メロディー{phraseIndex + 1} をれんしゅう中
                    </p>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] font-bold text-slate-400">テープ：</span>
                      <button
                        type="button"
                        onClick={() => setShowVirtualTape((v) => !v)}
                        className={`rounded-full px-2 py-0.5 text-[11px] font-bold transition ${showVirtualTape ? "bg-[#eef7e8] text-[#3a7a30]" : "bg-slate-100 text-slate-400"}`}
                      >
                        ON
                      </button>
                      <span className="text-[10px] text-slate-300">/</span>
                      <button
                        type="button"
                        onClick={() => setShowVirtualTape((v) => !v)}
                        className={`rounded-full px-2 py-0.5 text-[11px] font-bold transition ${!showVirtualTape ? "bg-[#f5e8e8] text-[#7a3030]" : "bg-slate-100 text-slate-400"}`}
                      >
                        OFF
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-center gap-3">
                    <div className="flex items-center gap-3">
                      <button
                        onClick={handleBack}
                        className="mother-button-light px-4 py-2 text-sm font-semibold"
                      >
                        1音戻る
                      </button>

                      <button
                        onClick={handleNext}
                        className="mother-button-light px-4 py-2 text-sm font-semibold"
                      >
                        1音進む
                      </button>
                    </div>

                    <button
                      onClick={() => void playCurrentNote()}
                      className="mother-button-blue px-4 py-2 text-sm font-semibold"
                    >
                      お手本
                    </button>

                    <button
                      onClick={() => {
                        if (isPlaying) {
                          clearPlaybackTimer()
                          clearCountdownTimer()
                          setCountdown(null)
                          setIsPlaying(false)
                        } else {
                          void handleStage4PlayMelody()
                        }
                      }}
                      className="mother-button-blue px-4 py-2 text-sm font-semibold"
                    >
                      {isPlaying ? "とめる" : "このメロディーを再生"}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="mother-subpanel mt-3 flex flex-col items-center gap-2 px-5 py-4 text-center">
              <div className="flex items-center gap-3">
                <PixelInventorFace />
                <p className="mother-text-main text-sm font-bold">
                  いろいろひいたら　ステージ選択にもどってよ
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  clearPlaybackTimer()
                  clearCountdownTimer()
                  setCountdown(null)
                  setIsPlaying(false)
                  setScreen("stageSelect")
                }}
                className="mother-button-light px-5 py-3 text-sm font-bold"
              >
                ステージ選択へ
              </button>
            </div>
          </section>
        </div>
      </main>
    )
  }

if (selectedStage === 5) {
  return (
    <main className="min-h-screen bg-[#10234d] px-3 py-3 text-white">
      <div className="mx-auto flex max-w-[1240px] flex-col gap-2">
        <section className="mother-panel flex flex-col p-3 text-slate-900">
          <div className="mb-2 flex flex-col gap-2 md:flex-row md:items-center md:gap-3">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <PixelInventorFace />
              <div className="min-w-0">
                <p className="mother-text-soft text-[11px] font-black tracking-wide">
                  STAGE {selectedStage}
                </p>
                <p className="mother-text-main text-base font-bold">
                  エイトメロディーズを　とおしで　ひいてみて
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] font-bold text-slate-400">テープ：</span>
                <button
                  type="button"
                  onClick={() => setShowVirtualTape((v) => !v)}
                  className={`rounded-full px-2 py-0.5 text-[11px] font-bold transition ${showVirtualTape ? "bg-[#eef7e8] text-[#3a7a30]" : "bg-slate-100 text-slate-400"}`}
                >
                  ON
                </button>
                <span className="text-[10px] text-slate-300">/</span>
                <button
                  type="button"
                  onClick={() => setShowVirtualTape((v) => !v)}
                  className={`rounded-full px-2 py-0.5 text-[11px] font-bold transition ${!showVirtualTape ? "bg-[#f5e8e8] text-[#7a3030]" : "bg-slate-100 text-slate-400"}`}
                >
                  OFF
                </button>
              </div>
              <TempoSelector value={tempoMultiplier} onChange={setTempoMultiplier} variant="blue" />
            </div>
          </div>

          <div className="mother-subpanel px-3 py-2">
            <div className="mb-2 flex items-center justify-between">
              <p className="mother-text-main text-sm font-bold">ぜんたいの進行</p>
              <p className="mother-text-soft text-xs font-bold">
                {phraseIndex + 1} / {safePhrases.length}
              </p>
            </div>

            <div className="grid grid-cols-8 gap-2">
              {safePhrases.map((_, index) => {
                const isCurrent = index === phraseIndex
                const isDone = index < phraseIndex

                return (
                  <button
                    key={index}
                    type="button"
                    onClick={() => handleStage5JumpToMelody(index)}
                    className={`mother-step-card cursor-pointer px-2 py-2 text-center transition hover:opacity-70 active:scale-95 ${
                      isCurrent
                        ? "is-active"
                        : isDone
                        ? "bg-[#eaf4ff] text-slate-900"
                        : "text-slate-500"
                    }`}
                  >
                    <p className="hidden text-[9px] font-bold md:block">MELODY</p>
                    <p className="mt-1 text-lg font-black">{index + 1}</p>
                  </button>
                )
              })}
            </div>

            <div className="mother-progress-track mt-2 h-2.5 w-full overflow-hidden">
              <div
                className="mother-progress-fill h-full transition-all"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>

          <div className="mt-2 grid gap-2 md:grid-cols-[320px_1fr]">
            <div className="flex items-center justify-center py-3">
              <div className="relative flex h-[360px] w-[140px] items-end justify-center rounded-full bg-[#f3ead1] px-3 py-3">
                <div className="mother-neck relative h-full w-9 rounded-full">
                  <div className="absolute inset-x-0 bottom-0 top-0 flex flex-col justify-between py-4">
                    {Array.from({ length: 9 }).map((_, i) => (
                      <div key={i} className="h-px w-full bg-white/10" />
                    ))}
                  </div>

                  {nextVisibleNote?.note !== "休符" && nextIndicatorTop !== null && (
                    <div
                      className="mother-indicator-next absolute left-1/2 h-2.5 w-10 -translate-x-1/2 rounded-full"
                      style={{
                        top: `clamp(8px, calc(${nextIndicatorTop}% - 5px), calc(100% - 18px))`,
                        marginLeft: indicatorsAreClose ? "24px" : "0px",
                      }}
                    />
                  )}

                  {current.note !== "休符" && currentIndicatorTop !== null && (
                    <div
                      className="mother-indicator-current absolute left-1/2 h-3 w-12 -translate-x-1/2 rounded-full"
                      style={{
                        top: `clamp(8px, calc(${currentIndicatorTop}% - 6px), calc(100% - 20px))`,
                      }}
                    />
                  )}

                  {showVirtualTape && <VirtualTape />}
                </div>

                <div className="absolute bottom-0 left-1/2 h-[74px] w-[88px] -translate-x-1/2 translate-y-5 rounded-[46%] border-4 border-slate-700 bg-[#fffaf0]">
                  <div className="absolute left-[24px] top-[22px] h-[8px] w-[8px] rounded-full bg-slate-700" />
                  <div className="absolute right-[24px] top-[22px] h-[8px] w-[8px] rounded-full bg-slate-700" />
                  <div className="absolute left-0 top-[39px] h-[2px] w-full bg-slate-700" />
                </div>
              </div>
            </div>

            <div className="flex min-w-0 flex-col gap-2">
              <PreviewLaneSix
                items={previewItems}
                staffItems={pairPreviewItems}
                onSelect={handlePreviewSelect}
                variant="light"
                showNotation={showNotation}
                onToggleNotation={setShowNotation}
              />

              <div className="mother-subpanel flex min-h-[104px] flex-col gap-2 px-3 py-3">
                <p className="mother-text-soft text-center text-sm font-bold">
                  いまは メロディー{phraseIndex + 1} をつうか中
                </p>

                <div className="flex flex-wrap items-center justify-center gap-2">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleBack}
                      className="mother-button-light px-3 py-2 text-sm font-semibold"
                    >
                      1音戻る
                    </button>

                    <button
                      onClick={handleNext}
                      className="mother-button-light px-3 py-2 text-sm font-semibold"
                    >
                      1音進む
                    </button>
                  </div>

                  <button
                    onClick={() => void playCurrentNote()}
                    className="mother-button-blue px-3 py-2 text-sm font-semibold"
                  >
                    お手本
                  </button>

                  {isPlaying ? (
                    <button
                      type="button"
                      onClick={() => {
                        clearPlaybackTimer()
                        clearCountdownTimer()
                        setCountdown(null)
                        setIsPlaying(false)
                      }}
                      className="mother-button-blue px-3 py-2 text-sm font-semibold"
                    >
                      とめる
                    </button>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => void handleStage5PlayAll()}
                        className="mother-button-blue px-3 py-2 text-sm font-semibold"
                      >
                        はじめから再生
                      </button>
                      {!(phraseIndex === 0 && noteIndex === 0) && (
                        <button
                          type="button"
                          onClick={() => void handleStage5Resume()}
                          className="mother-button-light px-3 py-2 text-sm font-semibold"
                        >
                          とちゅうから再生
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="mother-subpanel mt-2 flex flex-col items-center gap-2 px-4 py-3 text-center">
            <div className="flex items-center gap-3">
              <PixelInventorFace />
              <p className="mother-text-main text-sm font-bold">
                とまってもいいから　さいごまでやってみてよ
              </p>
            </div>

            <button
              type="button"
              onClick={() => {
                clearPlaybackTimer()
                clearCountdownTimer()
                setCountdown(null)
                setIsPlaying(false)
                setScreen("stageSelect")
              }}
              className="mother-button-light px-5 py-2.5 text-sm font-bold"
            >
              ステージ選択へ
            </button>
          </div>
        </section>
      </div>
    </main>
  )
}

if (selectedStage === 6) {
  return (
    <main className="min-h-screen bg-[#05070D] px-3 py-3 text-white">
      <div className="mx-auto flex max-w-[1240px] flex-col gap-2">
        <section className="rounded-[36px] border border-white/10 bg-[#171A22] p-3 text-white shadow-[0_22px_60px_rgba(0,0,0,0.48)]">
          <div className="mb-2 flex flex-col gap-2 md:flex-row md:items-center md:gap-3">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <PixelInventorFace />
              <div className="min-w-0">
                <p className="text-[11px] font-black tracking-wide text-[#6B7280]">
                  STAGE {selectedStage}
                </p>
                <p className="text-base font-bold text-white">
                  本番だ　全体とおして　自分だけでひいてみて
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] font-bold text-slate-400">テープ：</span>
                <button
                  type="button"
                  onClick={() => setShowVirtualTape((v) => !v)}
                  className={`rounded-full px-2 py-0.5 text-[11px] font-bold transition ${showVirtualTape ? "bg-[#2a3a2a] text-[#7aba70]" : "bg-[#2A2F3A] text-slate-500"}`}
                >
                  ON
                </button>
                <span className="text-[10px] text-slate-600">/</span>
                <button
                  type="button"
                  onClick={() => setShowVirtualTape((v) => !v)}
                  className={`rounded-full px-2 py-0.5 text-[11px] font-bold transition ${!showVirtualTape ? "bg-[#3a2a2a] text-[#ba7070]" : "bg-[#2A2F3A] text-slate-500"}`}
                >
                  OFF
                </button>
              </div>
              <TempoSelector value={tempoMultiplier} onChange={setTempoMultiplier} variant="red" />
            </div>
          </div>

          <div className="rounded-[24px] bg-[#2A2F3A] px-3 py-2">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-bold text-white">ぜんたいの進行</p>
              <p className="text-xs font-bold text-slate-300">
                {phraseIndex + 1} / {safePhrases.length}
              </p>
            </div>

            <div className="grid grid-cols-8 gap-2">
              {safePhrases.map((_, index) => {
                const isCurrent = index === phraseIndex
                const isDone = index < phraseIndex

                return (
                  <div
                    key={index}
                    className={`rounded-[16px] px-2 py-2 text-center font-black ${
                      isCurrent
                        ? "bg-[#FFD54A] text-[#1F325C]"
                        : isDone
                        ? "bg-[#EAF4FF] text-slate-900"
                        : "bg-[#3A4050] text-slate-300"
                    }`}
                  >
                    <p className="hidden text-[9px] font-bold md:block">MELODY</p>
                    <p className="mt-1 text-lg font-black">{index + 1}</p>
                  </div>
                )
              })}
            </div>

            <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-[#3A4050]">
              <div
                className="h-full rounded-full bg-[#FF6B6B] transition-all"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>

          <div className="mt-2 grid gap-2 md:grid-cols-[0.34fr_0.66fr]">
            <div className="flex items-center justify-center py-3">
                <div className="relative flex h-[360px] w-[180px] items-end justify-center rounded-full bg-[radial-gradient(circle_at_50%_30%,rgba(255,255,255,0.26),rgba(255,255,255,0.10)_34%,rgba(255,255,255,0.03)_56%,transparent_74%)] px-4 py-4">
                  <div className="mother-neck relative h-full w-10 rounded-full">
                    <div className="absolute inset-x-0 bottom-0 top-0 flex flex-col justify-between py-4">
                      {Array.from({ length: 9 }).map((_, i) => (
                        <div key={i} className="h-px w-full bg-white/10" />
                      ))}
                    </div>

                    {nextVisibleNote?.note !== "休符" && nextIndicatorTop !== null && (
                      <div
                        className="absolute left-1/2 h-2.5 w-11 -translate-x-1/2 rounded-full bg-[#9CA3AF] shadow-[0_0_0_2px_rgba(156,163,175,0.25)]"
                        style={{
                          top: `clamp(8px, calc(${nextIndicatorTop}% - 5px), calc(100% - 18px))`,
                          marginLeft: indicatorsAreClose ? "26px" : "0px",
                        }}
                      />
                    )}

                    {current.note !== "休符" && currentIndicatorTop !== null && (
                      <div
                        className="absolute left-1/2 h-3 w-14 -translate-x-1/2 rounded-full bg-[#FFD54A] shadow-[0_0_0_4px_rgba(255,213,74,0.22)]"
                        style={{
                          top: `clamp(8px, calc(${currentIndicatorTop}% - 6px), calc(100% - 20px))`,
                        }}
                      />
                    )}

                    {showVirtualTape && <VirtualTape />}
                  </div>

                  <div className="absolute bottom-0 left-1/2 h-[82px] w-[96px] -translate-x-1/2 translate-y-6 rounded-[46%] border-4 border-slate-700 bg-[#fffaf0]">
                    <div className="absolute left-[27px] top-[24px] h-[8px] w-[8px] rounded-full bg-slate-700" />
                    <div className="absolute right-[27px] top-[24px] h-[8px] w-[8px] rounded-full bg-slate-700" />
                    <div className="absolute left-0 top-[42px] h-[2px] w-full bg-slate-700" />
                  </div>
                </div>
            </div>

            <div className="flex min-w-0 flex-col gap-2">
              <PreviewLaneSix
                items={previewItems}
                staffItems={pairPreviewItems}
                variant="dark"
                showNotation={showNotation}
                onToggleNotation={setShowNotation}
              />

{/* スコアエリア */}
<div className="rounded-[28px] bg-[#2A2F3A] px-3 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
  
  {/* MIC ON バッジ */}
  <div className="mb-2 flex items-center justify-end gap-2">
    <div className="flex items-center gap-2 rounded-full border border-red-500 bg-red-500/25 px-3 py-1 text-xs font-bold text-[#FFD0D0]">
      <span className="h-2 w-2 animate-pulse rounded-full bg-red-400" />
      MIC ON
    </div>
  </div>

  {/* スコア表示 */}
  <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
    
    <div className="rounded-[20px] bg-[#3A4050] px-3 py-3 text-center">
      <p className="mb-1 text-xs font-bold text-slate-300">入力音</p>
      <p className="min-h-[32px] text-2xl font-black text-white">
        {detectedNote || "-"}
      </p>
    </div>

    <div
      className={`rounded-[20px] px-3 py-3 text-center ${
        judgeState === "ok"
          ? "bg-[#DFF7DF] text-[#1B6B2C]"
          : judgeState === "miss"
          ? "bg-[#FFE2E2] text-[#B33737]"
          : "bg-[#3A4050] text-slate-300"
      }`}
    >
      <p className="mb-1 text-xs font-bold">判定</p>
      <p className="min-h-[32px] text-2xl font-black">
        {judgeState === "ok"
          ? "OK!"
          : judgeState === "miss"
          ? "MISS"
          : "-"}
      </p>
    </div>

    <div className="rounded-[20px] bg-[#3A4050] px-3 py-3 text-center">
      <p className="mb-1 text-xs font-bold text-slate-300">スコア</p>
      <p className="min-h-[32px] text-3xl font-black text-white">
        {stage6Score}
      </p>
    </div>

    <div className="rounded-[20px] bg-[#3A4050] px-3 py-3 text-center">
      <p className="mb-1 text-xs font-bold text-slate-300">成功数</p>
      <p className="min-h-[32px] text-2xl font-black text-white">
        {stage6Hits}
      </p>
    </div>
  </div>

  {/* ボタン */}
  <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
    
    {/* 👇 本番ボタン（赤） */}
    <button
      type="button"
      onClick={() => {
        if (isPlaying || countdown !== null) {
          clearPlaybackTimer()
          clearCountdownTimer()
          setCountdown(null)
          setIsPlaying(false)
        } else {
          void handleStage6Start()
        }
      }}
      className="px-5 py-2.5 text-sm font-bold rounded-full 
      bg-gradient-to-b from-[#FF6B6B] to-[#C53030] 
      text-white shadow-[0_6px_18px_rgba(255,80,80,0.4)] 
      active:scale-95 transition"
    >
      {countdown !== null
        ? `${countdown}`
        : isPlaying
        ? "中断する"
        : "本番スタート"}
    </button>

    {/* 👇 リトライ（赤寄せ） */}
    <button
      type="button"
      onClick={() => {
        clearPlaybackTimer()
        clearCountdownTimer()
        setCountdown(null)
        setIsPlaying(false)
        resetStage6Result()
        setPhraseIndex(0)
        setNoteIndex(0)
        setJudgeState("idle")
        setDetectedNote("")
        setDetectedFreq(0)
      }}
      className="px-5 py-2.5 text-sm font-bold rounded-full 
      bg-[#3A1F24] text-[#FFB4B4] border border-[#FF6B6B]"
    >
      もういちど挑戦
    </button>
  </div>
</div>
            </div>
          </div>

          {stage6ResultOpen && (
            <div className="mt-2 rounded-[24px] bg-[#2A2F3A] px-4 py-4 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
              <p className="text-base font-black text-white">けっか</p>

              <div className="mt-3 grid gap-2 md:grid-cols-3">
                <div className="rounded-[20px] bg-[#3A4050] px-4 py-4 text-white">
                  <p className="text-xs font-bold text-slate-400">スコア</p>
                  <p className="mt-2 text-3xl font-black text-white">
                    {stage6Score}
                  </p>
                </div>

                <div className="rounded-[20px] bg-[#3A4050] px-4 py-4 text-white">
                  <p className="text-xs font-bold text-slate-400">成功数</p>
                  <p className="mt-2 text-3xl font-black text-white">
                    {stage6Hits} / {totalPlayableNotes}
                  </p>
                </div>

                <div className="rounded-[20px] bg-[#3A4050] px-4 py-4 text-white">
                  <p className="text-xs font-bold text-slate-400">正答率</p>
                  <p className="mt-2 text-3xl font-black text-white">
                    {stage6Accuracy}%
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="mt-2 rounded-[24px] bg-[#11141B] px-4 py-3 text-center">
            <div className="flex flex-col items-center gap-2">
              <div className="flex items-center gap-3">
                <PixelInventorFace />
                <p className="text-sm font-bold text-white">
                  うまくいかなかったら　もどって　練習だ
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  clearPlaybackTimer()
                  clearCountdownTimer()
                  setCountdown(null)
                  setIsPlaying(false)
                  stopMic()
                  setScreen("stageSelect")
                }}
                className="mother-button-light px-5 py-2.5 text-sm font-bold"
              >
                ステージ選択へ
              </button>
            </div>
          </div>
        </section>
      </div>
    </main>
  )
}

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#10234d] px-6 py-8 text-white">
      <div className="mother-panel w-full max-w-[720px] px-10 py-10 text-center text-slate-900">
        <p className="text-lg font-bold">ここは準備中です。</p>
      </div>
    </main>
  )
}