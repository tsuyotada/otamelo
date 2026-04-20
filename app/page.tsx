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
}

type FlatNoteItem = {
  phraseIndex: number
  noteIndex: number
  note: string
  length: number
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

function getNotationMidi(note: string): number | null {
  return japaneseNoteToMidi(note)
}

function getStaffPositionFromMidi(midi: number): number {
  // 高音が見切れにくいように、基準を少し上げる
  // もともと E4 基準だったものを A4 基準寄りにする
  return midi - 69
}

function getDurationLabel(length: number) {
  if (length >= 2) return "2"
  if (length >= 1) return "1"
  return "0.5"
}

function getLedgerOffsets(noteCenterY: number, staffTop: number, staffBottom: number, lineGap: number) {
  const offsets: number[] = []

  if (noteCenterY < staffTop) {
    for (let y = staffTop - lineGap; y >= noteCenterY - 1; y -= lineGap) {
      offsets.push(y)
    }
  }

  if (noteCenterY > staffBottom) {
    for (let y = staffBottom + lineGap; y <= noteCenterY + 1; y += lineGap) {
      offsets.push(y)
    }
  }

  return offsets
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

  const lineGap = compact ? 10 : 12
  const topBase = compact ? 40 : 44
  const noteWidth = compact ? 18 : 20
  const noteHeight = compact ? 12 : 14
  const stemHeight = compact ? 24 : 28
  const leftStart = compact ? 28 : 34
  const stepX = compact ? 72 : 84
  const boxHeight = compact ? 180 : 200
  const minWidth = Math.max(520, leftStart * 2 + Math.max(visibleItems.length - 1, 0) * stepX + 90)
  const staffTop = topBase
  const staffBottom = topBase + lineGap * 4

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

        <label
          className={
            isDark
              ? "flex items-center gap-2 text-xs font-bold text-slate-400 select-none"
              : "flex items-center gap-2 text-xs font-bold text-slate-500 select-none"
          }
        >
          <input
            type="checkbox"
            checked
            onChange={(e) => onToggleNotation(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300"
          />
          音符表示
        </label>
      </div>

      <div
        className={`relative overflow-x-auto rounded-[20px] border ${
          isDark ? "border-[#485066] bg-[#202530]" : "border-slate-200 bg-[#FCFCFD]"
        }`}
        style={{ height: `${boxHeight}px` }}
      >
        <div className="relative" style={{ height: `${boxHeight}px`, minWidth: `${minWidth}px` }}>
          {[0, 1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className={`absolute left-4 right-4 h-[1.5px] ${isDark ? "bg-[#667085]" : "bg-slate-400"}`}
              style={{ top: `${staffTop + i * lineGap}px` }}
            />
          ))}

          {visibleItems.map((item, index) => {
            const midi = getNotationMidi(item.note)
            if (midi === null) return null

            const staffStep = getStaffPositionFromMidi(midi)
            const noteCenterY = staffBottom - staffStep * (lineGap / 2)
            const left = leftStart + index * stepX
            const ledgerYs = getLedgerOffsets(noteCenterY, staffTop, staffBottom, lineGap)
            const clickable = !!onSelect

            const headToneClass = item.isCurrent
              ? "border-[#D4A300] bg-[#FFD54A]"
              : item.isNext
              ? "border-[#3F8CFF] bg-[#EAF4FF]"
              : isDark
              ? "border-slate-100 bg-slate-100"
              : "border-slate-800 bg-slate-800"

            const stemToneClass = item.isCurrent
              ? "bg-[#D4A300]"
              : item.isNext
              ? "bg-[#3F8CFF]"
              : isDark
              ? "bg-slate-100"
              : "bg-slate-800"

            const labelToneClass = item.isCurrent
              ? "text-[#B38700]"
              : item.isNext
              ? "text-[#2563EB]"
              : isDark
              ? "text-slate-300"
              : "text-slate-500"

            return (
              <div key={item.id}>
                {ledgerYs.map((ledgerY, ledgerIndex) => (
                  <div
                    key={`${item.id}-ledger-${ledgerIndex}`}
                    className={`absolute h-[1.5px] ${isDark ? "bg-slate-300" : "bg-slate-500"}`}
                    style={{
                      top: `${ledgerY}px`,
                      left: `${left - 8}px`,
                      width: `${noteWidth + 16}px`,
                    }}
                  />
                ))}

                <button
                  type="button"
                  disabled={!clickable}
                  onClick={() => clickable && onSelect(item)}
                  className={clickable ? "absolute cursor-pointer" : "absolute cursor-default"}
                  style={{
                    left: `${left - 6}px`,
                    top: `${noteCenterY - stemHeight - 8}px`,
                    width: `${noteWidth + 18}px`,
                    height: `${stemHeight + noteHeight + 18}px`,
                  }}
                >
                  <span
                    className={`absolute rounded-full border-2 ${headToneClass}`}
                    style={{
                      width: `${noteWidth}px`,
                      height: `${noteHeight}px`,
                      left: "6px",
                      top: `${stemHeight}px`,
                      transform: "rotate(-18deg)",
                    }}
                  />

                  <span
                    className={`absolute w-[2px] ${stemToneClass}`}
                    style={{
                      left: `${noteWidth + 5}px`,
                      top: "0px",
                      height: `${stemHeight + 1}px`,
                    }}
                  />
                </button>

<div
  className="absolute -translate-x-1/2 text-center"
  style={{
    left: `${left + noteWidth / 2}px`,
    top: `${staffBottom + 28}px`,
    width: compact ? "54px" : "60px",
  }}
>
  <p className={`text-[11px] font-black ${labelToneClass}`}>
    {item.isCurrent ? "いま" : item.isNext ? "つぎ" : ""}
  </p>
</div>
              </div>
            )
          })}
        </div>
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
        onToggleNotation={onToggleNotation}
        variant="light"
      />
    )
  }

  return (
    <div className="mother-subpanel min-h-[214px] px-4 py-3">
      <div className="mb-3 flex items-center justify-between">
        <p className="mother-text-main text-sm font-bold">これからの音</p>

        <label className="flex items-center gap-2 text-xs font-bold text-slate-500 select-none">
          <input
            type="checkbox"
            checked={showNotation}
            onChange={(e) => onToggleNotation(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300"
          />
          音符表示
        </label>
      </div>

      <div className="grid grid-cols-5 gap-3">
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
              className={`min-h-[142px] rounded-[22px] border-2 px-3 py-3 text-center ${toneClass} ${
                clickable ? "cursor-pointer transition hover:-translate-y-[2px]" : "cursor-default"
              }`}
            >
              <p className="h-[16px] text-[10px] font-black">
                {item.isCurrent ? "いま" : item.isNext ? "つぎ" : ""}
              </p>
              <p className="mt-1 flex min-h-[48px] items-center justify-center text-[20px] font-black">
                {item.isPlaceholder ? "" : item.note}
              </p>
{!showNotation && (
  <p className="mt-2 text-[11px] font-bold opacity-70">
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
  onSelect,
  variant = "light",
  showNotation,
  onToggleNotation,
}: {
  items: PreviewItem[]
  onSelect?: (item: PreviewItem) => void
  variant?: "light" | "dark"
  showNotation: boolean
  onToggleNotation: (checked: boolean) => void
}) {
  const isDark = variant === "dark"

  if (showNotation) {
    return (
      <StaffPreview
        items={items}
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
          ? "rounded-[28px] bg-[#2A2F3A] px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
          : "mother-subpanel min-h-[214px] px-4 py-3"
      }
    >
      <div className="mb-3 flex items-center justify-between">
        <p className={isDark ? "text-sm font-bold text-white" : "mother-text-main text-sm font-bold"}>
          これからの音
        </p>

        <label
          className={
            isDark
              ? "flex items-center gap-2 text-xs font-bold text-slate-400 select-none"
              : "flex items-center gap-2 text-xs font-bold text-slate-500 select-none"
          }
        >
          <input
            type="checkbox"
            checked={showNotation}
            onChange={(e) => onToggleNotation(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300"
          />
          音符表示
        </label>
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
              ? "border-[#3F8CFF] bg-[#DCEBFF] text-slate-900"
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
              className={`min-h-[132px] rounded-[20px] border-2 px-2 py-3 text-center ${toneClass} ${
                clickable ? "cursor-pointer transition hover:-translate-y-[2px]" : "cursor-default"
              }`}
            >
              <p
                className={
                  isDark
                    ? "h-[16px] text-[10px] font-black text-inherit/80"
                    : "h-[16px] text-[10px] font-black"
                }
              >
                {item.isCurrent ? "いま" : item.isNext ? "つぎ" : ""}
              </p>

              <p className="mt-1 flex min-h-[44px] items-center justify-center text-[18px] font-black">
                {item.isPlaceholder ? "" : item.note}
              </p>

              <p
                className={
                  isDark
                    ? "mt-2 text-[10px] font-bold text-inherit/70"
                    : "mt-2 text-[10px] font-bold opacity-70"
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

export default function Page() {
  const [screen, setScreen] = useState<Screen>("home")
  const [selectedStage, setSelectedStage] = useState<StageId>(1)
  const [isFading, setIsFading] = useState(false)
  const [stageSelectVisible, setStageSelectVisible] = useState(false)
  const [phraseIndex, setPhraseIndex] = useState(0)
  const [noteIndex, setNoteIndex] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [tempo, setTempo] = useState(40)
  const [playMode, setPlayMode] = useState<PlayMode>("full")
  const [isPreparingAudio, setIsPreparingAudio] = useState(false)
  const [countdown, setCountdown] = useState<number | null>(null)
  const [showNotation, setShowNotation] = useState(false)

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
          }
        })

      return [
        ...visible,
        ...makePlaceholders(Math.max(0, 5 - visible.length), "stage4"),
      ]
    }

    if (selectedStage === 5 || selectedStage === 6) {
      const safeFlatIndex = Math.max(
        0,
        getFlatPlayableIndex(phraseIndex, noteIndex)
      )

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
            isCurrent: originalIndex === safeFlatIndex,
            isNext: originalIndex === safeFlatIndex + 1,
            isPhraseStart: false,
            melodyNumber: item.phraseIndex + 1,
            phraseIndex: item.phraseIndex,
            noteIndex: item.noteIndex,
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
  ])

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
        ? STAGE5_TEMPO
        : selectedStage === 6
        ? STAGE6_TEMPO
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
      const flatIndex = getFlatPlayableIndex(phraseIndex, noteIndex)

      if (flatIndex >= 0 && flatIndex < flatPlayableNotes.length - 1) {
        const nextFlat = flatPlayableNotes[flatIndex + 1]
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
      const flatIndex = getFlatPlayableIndex(phraseIndex, noteIndex)
      if (flatIndex > 0) {
        const prev = flatPlayableNotes[flatIndex - 1]
        setPhraseIndex(prev.phraseIndex)
        setNoteIndex(prev.noteIndex)
        return
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

    setTuningAnchors((prev) =>
      prev.map((item, index) =>
        index === tuningStepIndex
          ? {
              ...item,
              capturedFreq: Number(tuningLockedFreq.toFixed(2)),
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

    if (selectedStage === 6) {
      void playClick()
    } else {
      void playNote(current.note, getStepMs(current.length))
    }
  }, [
    screen,
    selectedStage,
    isPlaying,
    phraseIndex,
    noteIndex,
    tempo,
    current.note,
    current.length,
  ])

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
  }, [screen, tuningStepIndex])

  useEffect(() => {
    clearPlaybackTimer()

    if (screen !== "practice" || selectedStage === 1 || !isPlaying) return

    const stepMs = getStepMs(current.length)

    timerRef.current = window.setTimeout(() => {
      moveToNextNote()
    }, stepMs)

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
    }
  }, [])

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
              <p className="mother-text-soft text-sm font-black tracking-[0.18em]">
                STAGE SELECT
              </p>
              <h1 className="mother-text-main mt-2 text-2xl font-black md:text-3xl">
                どこからやってみる？
              </h1>
            </div>

            <div className="mt-8 flex flex-col gap-4">
              {stages.map((stage, index) => {
                const isCurrent = selectedStage === stage.id

                return (
                  <div key={stage.id} className="relative">
                    <button
                      type="button"
                      onClick={() => handleSelectStage(stage.id)}
                      className={`mother-white-panel relative w-full px-6 py-5 text-left transition hover:-translate-y-[2px] hover:shadow-lg ${
                        isCurrent ? "ring-4 ring-[#3F8CFF]/35" : ""
                      }`}
                    >
                      <p className="text-lg font-black text-[#3F8CFF]">
                        STAGE {stage.id}
                      </p>
                      <p className="mother-text-main mt-1 text-lg font-black leading-tight">
                        {stage.title}
                      </p>
                    </button>

                    {index < stages.length - 1 && (
                      <div className="pointer-events-none mx-auto h-6 w-1 rounded-full bg-[#FFD54A]" />
                    )}
                  </div>
                )
              })}
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

              <button
                type="button"
                onClick={() => setScreen("tune")}
                className="mother-button-light px-5 py-3 text-sm font-bold"
              >
                調整してみる
              </button>
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
              <div className="mother-subpanel flex items-center justify-center p-4">
                <div className="flex h-full w-full items-center justify-center">
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
                    </div>

                    <div className="absolute bottom-0 left-1/2 h-[96px] w-[112px] -translate-x-1/2 translate-y-6 rounded-[46%] border-4 border-slate-700 bg-[#fffaf0]">
                      <div className="absolute left-[31px] top-[28px] h-[8px] w-[8px] rounded-full bg-slate-700" />
                      <div className="absolute right-[31px] top-[28px] h-[8px] w-[8px] rounded-full bg-slate-700" />
                      <div className="absolute left-0 top-[48px] h-[2px] w-full bg-slate-700" />
                    </div>
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

            <div className="mother-white-panel mb-4 p-4">
              <div className="mb-3 flex items-center justify-center gap-4">
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
                      <p className="text-[9px] font-bold">MELODY</p>
                      <p className="mt-1 text-xl font-black">{index + 1}</p>
                    </div>
                  )
                })}
              </div>

              <div className="mother-progress-track mt-4 h-3 w-full overflow-hidden">
                <div
                  className="mother-progress-fill h-full transition-all"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-[0.95fr_1.05fr]">
              <div className="mother-subpanel flex items-center justify-center p-4">
                <div className="relative flex h-[min(54vh,460px)] w-[150px] items-end justify-center rounded-full bg-[#f3ead1] px-4 py-5">
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
                  </div>

                  <div className="absolute bottom-0 left-1/2 h-[82px] w-[96px] -translate-x-1/2 translate-y-6 rounded-[46%] border-4 border-slate-700 bg-[#fffaf0]">
                    <div className="absolute left-[27px] top-[24px] h-[8px] w-[8px] rounded-full bg-slate-700" />
                    <div className="absolute right-[27px] top-[24px] h-[8px] w-[8px] rounded-full bg-slate-700" />
                    <div className="absolute left-0 top-[42px] h-[2px] w-full bg-slate-700" />
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-4">
                <div className="mother-settings-card p-4">
                  <p className="mother-text-main mb-3 text-base font-bold">
                    まずは全体をきいて、イメージをもちましょう。
                  </p>

                  <div className="grid grid-cols-1 gap-3">
                    <button
                      onClick={() => void ensureAudioReady().then(() => setIsPlaying(true))}
                      className="mother-button-blue px-4 py-3 text-lg font-bold disabled:opacity-70"
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
                      className="mother-button-light px-4 py-3 text-base font-bold"
                    >
                      とめる
                    </button>
                  </div>
                </div>

                <div className="mother-display-blue flex min-h-[220px] flex-col items-center justify-center px-5 py-6 text-center">
                  <p className="text-sm font-bold text-slate-600">今聞いている音</p>
                  <p className="mt-3 min-h-[72px] text-5xl font-black leading-none text-slate-900">
                    {current.note === "休符" ? "-" : current.note}
                  </p>
                  <p className="mt-3 text-sm font-bold text-slate-600">
                    {safePhrases[phraseIndex]?.title ?? ""}
                  </p>
                </div>
              </div>
            </div>

            <div className="mother-subpanel mt-4 flex flex-col items-center gap-3 px-5 py-5 text-center">
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
              <div className="mother-subpanel flex items-center justify-center p-4">
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
                  <p className="mother-text-soft text-center text-sm font-bold">
                    メロディー1 をれんしゅう中
                  </p>

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
                      <p className="text-[10px] font-bold">MELODY</p>
                      <p className="mt-1 text-xl">{index + 1}</p>
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="mt-3 grid gap-3 md:grid-cols-[0.38fr_0.62fr]">
              <div className="mother-subpanel flex items-center justify-center p-4">
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
                  <p className="mother-text-soft text-center text-sm font-bold">
                    メロディー{phraseIndex + 1} をれんしゅう中
                  </p>

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
                  エイトメロディーズを　とおしで　ひいてみて
                </p>
              </div>
            </div>

            <div className="mother-subpanel px-4 py-3">
              <div className="mb-3 flex items-center justify-between">
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
                      <p className="text-[9px] font-bold">MELODY</p>
                      <p className="mt-1 text-xl font-black">{index + 1}</p>
                    </div>
                  )
                })}
              </div>

              <div className="mother-progress-track mt-4 h-3 w-full overflow-hidden">
                <div
                  className="mother-progress-fill h-full transition-all"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>

            <div className="mt-3 grid gap-3 md:grid-cols-[0.38fr_0.62fr]">
              <div className="mother-subpanel flex items-center justify-center p-4">
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
                  </div>

                  <div className="absolute bottom-0 left-1/2 h-[82px] w-[96px] -translate-x-1/2 translate-y-6 rounded-[46%] border-4 border-slate-700 bg-[#fffaf0]">
                    <div className="absolute left-[27px] top-[24px] h-[8px] w-[8px] rounded-full bg-slate-700" />
                    <div className="absolute right-[27px] top-[24px] h-[8px] w-[8px] rounded-full bg-slate-700" />
                    <div className="absolute left-0 top-[42px] h-[2px] w-full bg-slate-700" />
                  </div>
                </div>
              </div>

              <div className="flex min-w-0 flex-col gap-4">
                <PreviewLaneSix
                  items={previewItems}
                  onSelect={handlePreviewSelect}
                  variant="light"
                  showNotation={showNotation}
                  onToggleNotation={setShowNotation}
                />

                <div className="mother-subpanel flex min-h-[126px] flex-col gap-3 px-4 py-4">
                  <p className="mother-text-soft text-center text-sm font-bold">
                    いまは メロディー{phraseIndex + 1} をつうか中
                  </p>

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
                      type="button"
                      onClick={() => {
                        if (isPlaying) {
                          clearPlaybackTimer()
                          clearCountdownTimer()
                          setCountdown(null)
                          setIsPlaying(false)
                        } else {
                          void handleStage5PlayAll()
                        }
                      }}
                      className="mother-button-blue px-4 py-2 text-sm font-semibold"
                    >
                      {isPlaying ? "とめる" : "はじめから再生"}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="mother-subpanel mt-3 flex flex-col items-center gap-2 px-5 py-4 text-center">
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

  if (selectedStage === 6) {
    return (
      <main className="min-h-screen bg-[#05070D] px-4 py-4 text-white">
        <div className="mx-auto flex max-w-[1240px] flex-col gap-3">
          <section className="rounded-[36px] border border-white/10 bg-[#171A22] p-4 text-white shadow-[0_22px_60px_rgba(0,0,0,0.48)]">
            <div className="mb-3 flex items-center gap-3">
              <PixelInventorFace />
              <div>
                <p className="text-[11px] font-black tracking-wide text-[#6B7280]">
                  STAGE {selectedStage}
                </p>
                <p className="text-base font-bold text-white">
                  本番だ　全体とおして　自分だけでひいてみて
                </p>
              </div>
            </div>

            <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-[20px] border-2 border-[#FF8B8B] bg-[#2A1215] px-4 py-3">
              <p className="text-sm font-black text-[#FFD0D0]">
                BOSS戦だとおもってください　マイク判定でスコアを記録します
              </p>

              <div className="inline-flex items-center gap-2 rounded-full bg-[#3A161A] px-4 py-2 text-sm font-black text-[#FFB4B4]">
                <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-[#FF4D4F]" />
                MIC ON
              </div>
            </div>

            <div className="rounded-[24px] bg-[#2A2F3A] px-4 py-3">
              <div className="mb-3 flex items-center justify-between">
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
                      <p className="text-[9px] font-bold">MELODY</p>
                      <p className="mt-1 text-xl font-black">{index + 1}</p>
                    </div>
                  )
                })}
              </div>

              <div className="mt-4 h-3 w-full overflow-hidden rounded-full bg-[#3A4050]">
                <div
                  className="h-full rounded-full bg-[#FF6B6B] transition-all"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>

            <div className="mt-3 grid gap-3 md:grid-cols-[0.38fr_0.62fr]">
              <div className="rounded-[28px] bg-[#11141B] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
                <div className="flex items-center justify-center">
                  <div className="relative flex h-[min(50vh,440px)] w-[190px] items-end justify-center rounded-full bg-[radial-gradient(circle_at_50%_30%,rgba(255,255,255,0.26),rgba(255,255,255,0.10)_34%,rgba(255,255,255,0.03)_56%,transparent_74%)] px-4 py-4">
                    <div className="mother-neck relative h-full w-10 rounded-full">
                      <div className="absolute inset-x-0 bottom-0 top-0 flex flex-col justify-between py-4">
                        {Array.from({ length: 9 }).map((_, i) => (
                          <div key={i} className="h-px w-full bg-white/10" />
                        ))}
                      </div>

                      {nextVisibleNote?.note !== "休符" && nextIndicatorTop !== null && (
                        <div
                          className="absolute left-1/2 h-2.5 w-11 -translate-x-1/2 rounded-full bg-[#63A7FF] shadow-[0_0_0_2px_rgba(99,167,255,0.3)]"
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
                    </div>

                    <div className="absolute bottom-0 left-1/2 h-[82px] w-[96px] -translate-x-1/2 translate-y-6 rounded-[46%] border-4 border-slate-700 bg-[#fffaf0]">
                      <div className="absolute left-[27px] top-[24px] h-[8px] w-[8px] rounded-full bg-slate-700" />
                      <div className="absolute right-[27px] top-[24px] h-[8px] w-[8px] rounded-full bg-slate-700" />
                      <div className="absolute left-0 top-[42px] h-[2px] w-full bg-slate-700" />
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex min-w-0 flex-col gap-4">
                <PreviewLaneSix
                  items={previewItems}
                  variant="dark"
                  showNotation={showNotation}
                  onToggleNotation={setShowNotation}
                />

                <div className="rounded-[28px] bg-[#2A2F3A] px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                  <p className="text-center text-sm font-bold text-slate-300">
                    マイクで本番ちゅう
                  </p>

                  <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
                    <div className="rounded-[22px] bg-[#3A4050] px-3 py-3 text-center">
                      <p className="mb-1 text-xs font-bold text-slate-300">
                        入力された音
                      </p>
                      <p className="min-h-[36px] text-2xl font-black text-white">
                        {detectedNote || "-"}
                      </p>
                    </div>

                    <div
                      className={`rounded-[22px] px-3 py-3 text-center ${
                        judgeState === "ok"
                          ? "bg-[#DFF7DF] text-[#1B6B2C]"
                          : judgeState === "miss"
                          ? "bg-[#FFE2E2] text-[#B33737]"
                          : "bg-[#3A4050] text-slate-300"
                      }`}
                    >
                      <p className="mb-1 text-xs font-bold">判定</p>
                      <p className="min-h-[36px] text-2xl font-black">
                        {judgeState === "ok"
                          ? "OK!"
                          : judgeState === "miss"
                          ? "MISS"
                          : "..."}
                      </p>
                    </div>

                    <div className="rounded-[22px] bg-[#162C63] px-3 py-3 text-center text-white shadow-[0_8px_20px_rgba(22,44,99,0.25)]">
                      <p className="mb-1 text-xs font-bold text-white/70">
                        スコア
                      </p>
                      <p className="min-h-[36px] text-3xl font-black">
                        {stage6Score}
                      </p>
                    </div>

                    <div className="rounded-[22px] bg-[#3A4050] px-3 py-3 text-center">
                      <p className="mb-1 text-xs font-bold text-slate-300">
                        成功数
                      </p>
                      <p className="min-h-[36px] text-2xl font-black text-white">
                        {stage6Hits}
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
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
                      className="mother-button-blue px-5 py-3 text-sm font-bold"
                    >
                      {countdown !== null
                        ? `${countdown}`
                        : isPlaying
                        ? "中断する"
                        : "本番スタート"}
                    </button>

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
                      className="mother-button-light px-5 py-3 text-sm font-bold"
                    >
                      もういちど挑戦
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {stage6ResultOpen && (
              <div className="mt-3 rounded-[24px] bg-[#2A2F3A] px-5 py-5 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                <p className="text-base font-black text-white">けっか</p>

                <div className="mt-4 grid gap-3 md:grid-cols-3">
                  <div className="rounded-[22px] bg-[#3A4050] px-4 py-4 text-white">
                    <p className="text-xs font-bold text-slate-400">スコア</p>
                    <p className="mt-2 text-3xl font-black text-white">
                      {stage6Score}
                    </p>
                  </div>

                  <div className="rounded-[22px] bg-[#3A4050] px-4 py-4 text-white">
                    <p className="text-xs font-bold text-slate-400">成功数</p>
                    <p className="mt-2 text-3xl font-black text-white">
                      {stage6Hits} / {totalPlayableNotes}
                    </p>
                  </div>

                  <div className="rounded-[22px] bg-[#3A4050] px-4 py-4 text-white">
                    <p className="text-xs font-bold text-slate-400">正答率</p>
                    <p className="mt-2 text-3xl font-black text-white">
                      {stage6Accuracy}%
                    </p>
                  </div>
                </div>
              </div>
            )}

            <div className="mt-3 rounded-[24px] bg-[#2A2F3A] px-5 py-4 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
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
                  className="mother-button-light px-5 py-3 text-sm font-bold"
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