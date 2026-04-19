"use client"

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

type Screen = "home" | "stageSelect" | "practice"
type PlayMode = "phrase" | "full"
type JudgeState = "idle" | "ok" | "miss"

type StageId = 1 | 2 | 3 | 4 | 5

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
}

const stages: StageItem[] = [
  { id: 1, title: "まずは　オタマトーンをならしてみようか" },
  { id: 2, title: "エイトメロディーズをきいてみる" },
  { id: 3, title: "ひとつめのメロディーをひいてみる" },
  { id: 4, title: "ふたつめからさきのメロディーをひいてみる" },
  { id: 5, title: "マイク判定をつかってみる" },
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

const STAGE3_TEMPO = 24

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

/**
 * 0 = 下端（顔から遠い）
 * 1 = 上端（顔のすぐ上）
 */
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

/**
 * 0 = 上側（顔から遠い）
 * 1 = 下側（顔に近い）
 */
function getOtamatoneTopPercent(note: string): number | null {
  const normalized = getOtamatoneNormalizedPosition(note)
  if (normalized === null) return null
  return normalized * 100
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

function HomeOtamatoneFace() {
  return (
    <div className="mx-auto mb-5 h-[110px] w-[110px] rounded-[46%] border-4 border-slate-700 bg-[#fffaf0] shadow-md">
      <div className="relative h-full w-full">
        <div className="absolute left-[28px] top-[32px] h-[10px] w-[10px] rounded-full bg-slate-700" />
        <div className="absolute right-[28px] top-[32px] h-[10px] w-[10px] rounded-full bg-slate-700" />
        <div className="absolute left-0 top-[56px] h-[3px] w-full bg-slate-700" />
      </div>
    </div>
  )
}

function PreviewLane({ items }: { items: PreviewItem[] }) {
  return (
    <div className="mother-subpanel px-4 py-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="mother-text-main text-sm font-bold">これからの音</p>
        <p className="mother-text-soft text-xs font-bold">5音先まで</p>
      </div>

      <div className="flex gap-3 overflow-x-auto pb-1">
        {items.map((item) => (
          <div key={item.id} className="flex items-center gap-3">
            {item.isPhraseStart && (
              <div className="flex flex-col items-center justify-center gap-1">
                <div className="h-12 w-px bg-slate-300" />
                <span className="rounded-full bg-slate-200 px-2 py-1 text-[10px] font-black text-slate-600">
                  MELODY {item.melodyNumber}
                </span>
              </div>
            )}

            <div
              className={`min-w-[96px] rounded-[22px] px-3 py-4 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.88),0_2px_10px_rgba(20,44,99,0.04)] ${
                item.isCurrent
                  ? "bg-[#FFD54A] text-[#1F325C]"
                  : item.isNext
                  ? "border-2 border-[#3F8CFF] bg-[#EAF4FF] text-slate-900"
                  : "bg-white text-slate-700"
              }`}
            >
              <p className="text-[10px] font-black tracking-wide">
                {item.isCurrent ? "いま" : item.isNext ? "つぎ" : ""}
              </p>
              <p className="mt-1 min-h-[40px] text-2xl font-black leading-none">
                {item.note}
              </p>
              <p className="mt-2 text-[11px] font-bold opacity-70">
                長さ {item.length}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function Page() {
  const [screen, setScreen] = useState<Screen>("home")
  const [selectedStage, setSelectedStage] = useState<StageId>(1)
  const [phraseIndex, setPhraseIndex] = useState(0)
  const [noteIndex, setNoteIndex] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [tempo, setTempo] = useState(40)
  const [playMode, setPlayMode] = useState<PlayMode>("full")
  const [isPreparingAudio, setIsPreparingAudio] = useState(false)
  const [countdown, setCountdown] = useState<number | null>(null)

  const [isMicEnabled, setIsMicEnabled] = useState(false)
  const [isMicPreparing, setIsMicPreparing] = useState(false)
  const [detectedNote, setDetectedNote] = useState("")
  const [judgeState, setJudgeState] = useState<JudgeState>("idle")
  const [successCount, setSuccessCount] = useState(0)

  const audioContextRef = useRef<AudioContext | null>(null)
  const timerRef = useRef<number | null>(null)
  const countdownTimerRef = useRef<number | null>(null)

  const micStreamRef = useRef<MediaStream | null>(null)
  const micAudioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const micSourceRef = useRef<MediaStreamAudioSourceNode | null>(null)
  const micAnimationRef = useRef<number | null>(null)

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

  const phrase = safePhrases[phraseIndex]
  const safeNotes = phrase.notes
  const current = safeNotes[noteIndex] ?? safeNotes[0]
  const stageLabel = stages.find((stage) => stage.id === selectedStage)?.title ?? ""
  const stage1IndicatorTop =
    isMicEnabled && detectedNote ? getOtamatoneTopPercent(detectedNote) : null

  const nextVisibleNote = useMemo(() => {
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
  }, [noteIndex, safeNotes, playMode, phraseIndex, safePhrases])

  const previewItems = useMemo<PreviewItem[]>(() => {
  // ステージ3はメロディー1を固定表示して、色だけ移す
  if (selectedStage === 3) {
    const stage3Phrase = safePhrases[0]

    return stage3Phrase.notes
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
      }))
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
      })
    }

    n += 1
  }

  const currentIndex = items.findIndex((item) => item.isCurrent)
  const firstPreviewIndex = items.findIndex((item) => !item.isCurrent)

  if (currentIndex !== -1 && firstPreviewIndex !== -1) {
    items[firstPreviewIndex] = {
      ...items[firstPreviewIndex],
      isNext: true,
    }
  }

  return items
}, [phraseIndex, noteIndex, safePhrases, playMode, selectedStage])

  const visibleCurrentLabel = current.note === "休符" ? "" : current.note

  const currentIndicatorTop = getOtamatoneTopPercent(current.note)
  const nextIndicatorTop = nextVisibleNote
    ? getOtamatoneTopPercent(nextVisibleNote.note)
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
        .reduce((sum, p) => sum + p.notes.length, 0) + noteIndex + 1,
    [safePhrases, phraseIndex, noteIndex]
  )

  const progressPercent = totalNotes > 0 ? (passedNotes / totalNotes) * 100 : 0

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

  const getStepMs = (length = 1) => {
    const effectiveTempo = selectedStage === 3 ? STAGE3_TEMPO : tempo
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

    const oscillator = ctx.createOscillator()
    const gainNode = ctx.createGain()

    const now = ctx.currentTime

    oscillator.type = "square"
    oscillator.frequency.value = 1100

    gainNode.gain.setValueAtTime(0.0001, now)
    gainNode.gain.exponentialRampToValueAtTime(0.05, now + 0.005)
    gainNode.gain.exponentialRampToValueAtTime(0.0001, now + 0.025)

    oscillator.connect(gainNode)
    gainNode.connect(ctx.destination)

    oscillator.start(now)
    oscillator.stop(now + 0.03)
  }

  const playCurrentNote = async () => {
    if (isMicEnabled) return
    await playNote(current.note, getStepMs(current.length))
  }

  const moveToNextNote = () => {
    const isPhraseMode = playMode === "phrase"
    const isStage2ListenMode = selectedStage === 2 && playMode === "full"

    if (isPhraseMode && !isStage2ListenMode) {
      if (noteIndex < safeNotes.length - 1) {
        setNoteIndex((prev) => prev + 1)
      } else {
        setNoteIndex(0)
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
  }

  const handleSelectStage = (stageId: StageId) => {
    clearPlaybackTimer()
    clearCountdownTimer()
    setCountdown(null)
    setIsPlaying(false)
    setSelectedStage(stageId)
    setJudgeState("idle")
    setDetectedNote("")
    setSuccessCount(0)

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
      setPlayMode("phrase")
      setPhraseIndex(0)
      setNoteIndex(0)
    }

    setScreen("practice")
  }

  const handlePrevPhrase = () => {
    clearPlaybackTimer()
    clearCountdownTimer()
    setCountdown(null)
    setIsPlaying(false)
    setPlayMode("phrase")
    setPhraseIndex((prev) => Math.max(0, prev - 1))
    setNoteIndex(0)
    setJudgeState("idle")
  }

  const handleNextPhrase = () => {
    clearPlaybackTimer()
    clearCountdownTimer()
    setCountdown(null)
    setIsPlaying(false)
    setPlayMode("phrase")
    setPhraseIndex((prev) => Math.min(safePhrases.length - 1, prev + 1))
    setNoteIndex(0)
    setJudgeState("idle")
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

    if (noteIndex > 0) {
      setNoteIndex((prev) => prev - 1)
      return
    }

    if (playMode !== "phrase" && phraseIndex > 0) {
      const prevPhraseIndex = phraseIndex - 1
      const prevPhrase = safePhrases[prevPhraseIndex]
      setPhraseIndex(prevPhraseIndex)
      setNoteIndex(prevPhrase.notes.length - 1)
      return
    }

    setNoteIndex(0)
  }

  const handleResetSuccess = () => {
    setSuccessCount(0)
    setJudgeState("idle")
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

  const startMic = async () => {
    if (isMicEnabled) return

    try {
      setIsMicPreparing(true)
      clearPlaybackTimer()
      clearCountdownTimer()
      setCountdown(null)
      setIsPlaying(false)

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

      if (!AudioCtx) {
        setIsMicPreparing(false)
        return
      }

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
      stableHitCountRef.current = 0
      noteSolvedRef.current = false
    } catch {
      setIsMicEnabled(false)
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
    setIsMicEnabled(false)
    setDetectedNote("")
    setJudgeState("idle")
    stableHitCountRef.current = 0
    noteSolvedRef.current = false
    clearCountdownTimer()
    setCountdown(null)
  }

  const startPlaybackWithCountdown = async () => {
    clearPlaybackTimer()
    clearCountdownTimer()
    setIsPlaying(false)

    if (!isMicEnabled) {
      await ensureAudioReady()
      setIsPlaying(true)
      return
    }

    await ensureAudioReady()

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

  useEffect(() => {
    stableHitCountRef.current = 0
    noteSolvedRef.current = false
    setJudgeState("idle")
  }, [phraseIndex, noteIndex])

  useEffect(() => {
    if (
      screen !== "practice" ||
      selectedStage === 1 ||
      !isPlaying
    )
      return

    if (isMicEnabled) {
      void playClick()
    } else {
      void playNote(current.note, getStepMs(current.length))
    }
  }, [
    screen,
    selectedStage,
    isPlaying,
    isMicEnabled,
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
    clearPlaybackTimer()

    if (
      screen !== "practice" ||
      selectedStage === 1 ||
      !isPlaying
    )
      return

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
    successCount,
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
      const freq = getAutocorrelatedPitch(buffer, sampleRate)
      const note = freq > 0 ? closestNoteFromFrequency(freq) : ""
      setDetectedNote(note)

      if (selectedStage === 1) {
        setJudgeState("idle")
      } else if (!isPlaying || current.note === "休符") {
        setJudgeState("idle")
      } else if (!noteSolvedRef.current) {
        if (note && note === current.note) {
          stableHitCountRef.current += 1
          if (stableHitCountRef.current >= 4) {
            noteSolvedRef.current = true
            setJudgeState("ok")
            setSuccessCount((prev) => prev + 1)
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
        setJudgeState("ok")
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
  }, [isMicEnabled, isPlaying, current.note, selectedStage])

  useEffect(() => {
    if (screen !== "practice" || selectedStage === 1) return

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

      if (e.key === " " || e.key === "Spacebar") {
        e.preventDefault()
        void startPlaybackWithCountdown()
      }
    }

    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [screen, selectedStage, playMode, noteIndex, phraseIndex, isMicEnabled])

  useEffect(() => {
    return () => {
      stopMic()
      clearPlaybackTimer()
      clearCountdownTimer()
    }
  }, [])

  if (screen === "home") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#10234d] px-6 py-8 text-white">
        <div className="mother-panel w-full max-w-[720px] px-10 py-10 text-center text-slate-900">
          <HomeOtamatoneFace />

          <p className="mother-text-main mb-6 text-lg font-bold">
            オタマトーンの準備はできましたか？
          </p>

          {isPreparingAudio && (
            <div className="mother-subpanel mother-text-main mb-5 flex items-center justify-center gap-2 px-5 py-3 text-center text-sm font-bold">
              <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-slate-400/40 border-t-slate-700" />
              音を準備しています…
            </div>
          )}

          <button
            onClick={() => void handleOpenStage()}
            className="mother-button-blue px-8 py-4 text-xl font-bold disabled:opacity-70"
            disabled={isPreparingAudio}
          >
            {isPreparingAudio ? "準備中…" : "OK！"}
          </button>
        </div>
      </main>
    )
  }

  if (screen === "stageSelect") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#10234d] px-6 py-8 text-white">
        <div className="mother-panel w-full max-w-[920px] px-8 py-8 text-slate-900">
          <div className="mb-6 text-center">
            <p className="mother-text-soft text-sm font-black tracking-wide">
              STAGE SELECT
            </p>
            <h1 className="mother-text-main mt-2 text-2xl font-black">
              どこからやってみる？
            </h1>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {stages.map((stage) => (
              <button
                key={stage.id}
                type="button"
                onClick={() => handleSelectStage(stage.id)}
                className="mother-white-panel text-left px-5 py-5 transition hover:translate-y-[1px]"
              >
                <p className="text-xs font-black text-slate-500">
                  STAGE {stage.id}
                </p>
                <p className="mother-text-main mt-2 text-lg font-black leading-snug">
                  {stage.title}
                </p>
              </button>
            ))}
          </div>

          <div className="mt-6 flex justify-center">
            <button
              type="button"
              onClick={() => setScreen("home")}
              className="mother-button-light px-5 py-3 text-sm font-bold"
            >
              もどる
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

            <div className="mother-display-navy mb-4 px-5 py-5 text-center">
              <p className="text-sm font-bold text-white/75">
                エイトメロディーズをきいてみて
              </p>
              <p className="mt-2 text-xs font-bold text-white/60">
                ひととおりきいたら　ステージ選択にもどってよ
              </p>
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
                <div className="mother-display-blue flex min-h-[220px] flex-col items-center justify-center px-5 py-6 text-center">
                  <p className="text-sm font-bold text-slate-600">いまきいている音</p>
                  <p className="mt-3 min-h-[72px] text-5xl font-black leading-none text-slate-900">
                    {visibleCurrentLabel || "-"}
                  </p>
                  <p className="mt-3 text-sm font-bold text-slate-600">
                    {safePhrases[phraseIndex]?.title ?? ""}
                  </p>
                </div>

                <div className="mother-settings-card p-4">
                  <p className="mother-text-main mb-3 text-base font-bold">
                    さいせい
                  </p>

                  <div className="grid grid-cols-1 gap-3">
                    <button
                      onClick={() => void startPlaybackWithCountdown()}
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
        <div className="mx-auto flex max-w-[980px] flex-col gap-3">
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

            <div className="mother-display-navy mb-4 px-5 py-5 text-center">
              <p className="text-sm font-bold text-white/75">
                ひとつめのメロディーをひいてみて
              </p>
              <p className="mt-2 text-xs font-bold text-white/60">
                流れも見ながら　少しずつやってみよう
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-[0.85fr_1.15fr]">
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

              <div className="flex flex-col gap-4">
                <PreviewLane items={previewItems} />

                <div className="mother-subpanel flex flex-col gap-3 px-4 py-4">
                  <p className="mother-text-soft text-center text-sm font-bold">
                    メロディー1 をれんしゅう中
                  </p>

                  <div className="flex flex-wrap items-center justify-center gap-2">
  <div className="flex items-center gap-2">
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

  return (
    <main className="h-screen overflow-hidden bg-[#10234d] px-4 py-4 text-white">
      <div className="mx-auto grid h-[calc(100vh-32px)] max-w-[1560px] grid-cols-[2.3fr_0.9fr] gap-3">
        <section className="mother-panel flex flex-col p-4 text-slate-900">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
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

            <button
              type="button"
              onClick={() => {
                clearPlaybackTimer()
                clearCountdownTimer()
                setCountdown(null)
                setIsPlaying(false)
                setScreen("stageSelect")
              }}
              className="mother-button-light px-4 py-2 text-xs font-bold"
            >
              ステージ選択へ
            </button>
          </div>

          <PreviewLane items={previewItems} />

          <div className="grid flex-1 grid-cols-[210px_minmax(0,1fr)] gap-4">
            <div className="mother-subpanel flex items-center justify-center p-2">
              <div className="relative flex h-[min(58vh,460px)] w-[145px] items-end justify-center rounded-full bg-[#f3ead1] px-4 py-5">
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

            <div className="mother-subpanel flex flex-col p-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="mother-info-card px-3 py-3 text-center">
                  <p className="mb-1 text-xs font-bold text-slate-500">入力された音</p>
                  <p className="min-h-[36px] text-2xl font-black text-slate-900">
                    {detectedNote || "-"}
                  </p>

                  {isMicEnabled && (
                    <p className="mt-2 text-xs font-bold text-[#2E6EDC]">
                      マイク判定中
                    </p>
                  )}
                </div>

                <div
                  className={`rounded-[22px] px-3 py-3 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.85),0_2px_10px_rgba(20,44,99,0.04)] ${
                    judgeState === "ok"
                      ? "bg-[#dff7df] text-[#1b6b2c]"
                      : judgeState === "miss"
                      ? "bg-[#ffe2e2] text-[#b33737]"
                      : "mother-info-card text-slate-500"
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

                <div className="mother-info-card px-3 py-3 text-center">
                  <p className="mb-1 text-xs font-bold text-slate-500">成功数</p>
                  <p className="min-h-[36px] text-2xl font-black text-slate-900">
                    {successCount}
                  </p>
                </div>
              </div>

              <div className="mt-3 flex items-center justify-center gap-2">
                <button
                  onClick={handleBack}
                  className="mother-button-light px-3 py-2 text-xs font-semibold"
                >
                  1音戻る（←）
                </button>
                <button
                  onClick={handleNext}
                  className="mother-button-light px-3 py-2 text-xs font-semibold"
                >
                  1音進む（→）
                </button>

                {!isMicEnabled && (
                  <button
                    onClick={() => void playCurrentNote()}
                    className="mother-button-blue px-3 py-2 text-xs font-semibold"
                  >
                    お手本
                  </button>
                )}

                <button
                  onClick={handleResetSuccess}
                  className="mother-button-light px-3 py-2 text-xs font-semibold"
                >
                  成功数リセット
                </button>
              </div>
            </div>
          </div>
        </section>

        <aside className="mother-panel flex flex-col gap-3 p-4 text-slate-900">
          <div className="mother-settings-card p-4">
            <p className="mother-text-main mb-3 text-base font-bold">テンポ</p>
            <div className="mother-option flex items-center gap-3 px-4 py-3">
              <span className="inline-flex w-14 items-center justify-center rounded-full bg-[#FFD54A] px-3 py-1 text-center text-lg font-black text-[#1F325C]">
                {tempo}
              </span>
              <input
                type="range"
                min={20}
                max={180}
                step={5}
                value={tempo}
                onChange={(e) => setTempo(Number(e.target.value))}
                className="cursor-pointer flex-1"
              />
            </div>
          </div>

          <div className="mother-settings-card p-4">
            <p className="mother-text-main mb-3 text-base font-bold">再生モード</p>

            <div className="flex flex-col gap-3">
              <label className="mother-option flex cursor-pointer items-center gap-3 px-4 py-3">
                <input
                  type="radio"
                  name="playMode"
                  checked={playMode === "full"}
                  onChange={() => {
                    clearPlaybackTimer()
                    clearCountdownTimer()
                    setCountdown(null)
                    setIsPlaying(false)
                    setPlayMode("full")
                    setPhraseIndex(0)
                    setNoteIndex(0)
                  }}
                  className="h-4 w-4"
                />
                <span className="text-sm font-bold text-slate-800">
                  全体通し再生
                </span>
              </label>

              <label className="mother-option flex cursor-pointer items-center gap-3 px-4 py-3">
                <input
                  type="radio"
                  name="playMode"
                  checked={playMode === "phrase"}
                  onChange={() => {
                    clearPlaybackTimer()
                    clearCountdownTimer()
                    setCountdown(null)
                    setIsPlaying(false)
                    setPlayMode("phrase")
                  }}
                  className="h-4 w-4"
                />
                <span className="text-sm font-bold text-slate-800">
                  メロディーごと再生
                </span>
              </label>
            </div>

            {playMode === "phrase" && (
              <div className="mt-3 flex items-center gap-2">
                <button
                  onClick={handlePrevPhrase}
                  className="mother-button-light flex-1 px-3 py-2 text-xs font-semibold"
                >
                  前のメロディー
                </button>
                <button
                  onClick={handleNextPhrase}
                  className="mother-button-light flex-1 px-3 py-2 text-xs font-semibold"
                >
                  次のメロディー
                </button>
              </div>
            )}
          </div>

          <div className="mother-settings-card p-4">
            <p className="mother-text-main mb-3 text-base font-bold">マイク</p>
            <label className="mother-option flex cursor-pointer items-center gap-3 px-4 py-3">
              <input
                type="checkbox"
                checked={isMicEnabled}
                onChange={() => {
                  if (isMicEnabled) {
                    stopMic()
                  } else {
                    void startMic()
                  }
                }}
                className="h-4 w-4"
              />
              <span className="text-sm font-bold text-slate-800">
                マイク判定を使う
              </span>
            </label>
          </div>

          <div className="mother-settings-card p-4">
            <p className="mother-text-main mb-3 text-base font-bold">
              再生コントロール
            </p>
            <div className="grid grid-cols-1 gap-3">
              <button
                onClick={() => void startPlaybackWithCountdown()}
                className="mother-button-blue px-4 py-3 text-lg font-bold disabled:opacity-70"
              >
                <span className="flex items-center justify-center gap-2">
                  {(isPreparingAudio || isMicPreparing) && <Spinner />}
                  {countdown !== null
                    ? `${countdown}`
                    : isPreparingAudio
                    ? "準備中…"
                    : isMicEnabled
                    ? "クリックで再生"
                    : "再生"}
                </span>
              </button>

              <button
                onClick={() => {
                  clearPlaybackTimer()
                  clearCountdownTimer()
                  setCountdown(null)
                  setIsPlaying(false)
                }}
                className="mother-button-blue px-4 py-3 text-lg font-bold"
              >
                停止
              </button>
            </div>

            {(isPreparingAudio || isMicPreparing) && (
              <div className="mother-subpanel mother-text-main mt-3 flex items-center justify-center gap-2 px-4 py-3 text-center text-sm font-bold">
                <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-slate-400/40 border-t-slate-700" />
                音を準備しています…
              </div>
            )}
          </div>
        </aside>
      </div>
    </main>
  )
}