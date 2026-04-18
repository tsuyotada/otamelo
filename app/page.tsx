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

type Screen = "home" | "practice"
type PlayMode = "phrase" | "full"
type JudgeState = "idle" | "ok" | "miss"

type RankingEntry = {
  name: string
  score: number
}

const STORAGE_KEY = "otamelo_ranking_v1"

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
    <div className="relative h-[36px] w-[36px] shrink-0 overflow-hidden rounded-[4px] bg-[#ffd7b3] shadow-sm">
      <div className="absolute inset-x-0 top-0 h-[10px] bg-[#f2c94c]" />
      <div className="absolute left-[4px] top-[8px] h-[4px] w-[28px] bg-[#e0b63f]" />
      <div className="absolute left-[2px] top-[10px] h-[4px] w-[6px] bg-[#e0b63f]" />
      <div className="absolute right-[2px] top-[10px] h-[4px] w-[6px] bg-[#e0b63f]" />

      <div className="absolute left-[7px] top-[15px] h-[8px] w-[8px] rounded-full border-2 border-slate-800 bg-white/70" />
      <div className="absolute right-[7px] top-[15px] h-[8px] w-[8px] rounded-full border-2 border-slate-800 bg-white/70" />
      <div className="absolute left-1/2 top-[18px] h-[2px] w-[6px] -translate-x-1/2 bg-slate-800" />

      <div className="absolute left-[10px] top-[18px] h-[2px] w-[2px] bg-slate-800" />
      <div className="absolute right-[10px] top-[18px] h-[2px] w-[2px] bg-slate-800" />
      <div className="absolute left-1/2 top-[22px] h-[3px] w-[2px] -translate-x-1/2 bg-[#d6907e]" />
      <div className="absolute left-1/2 top-[27px] h-[2px] w-[10px] -translate-x-1/2 bg-slate-800" />
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

export default function Page() {
  const [screen, setScreen] = useState<Screen>("home")
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
  const [ranking, setRanking] = useState<RankingEntry[]>([])

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
  const fullRunScoreEligibleRef = useRef(false)

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

    for (const note of safeNotes) {
      if (note.note !== "休符") return note
    }

    return safeNotes[0]
  }, [noteIndex, safeNotes, playMode, phraseIndex, safePhrases])

  const visibleCurrentLabel = current.note === "休符" ? "" : current.note
  const visibleNextLabel =
    nextVisibleNote?.note === "休符" ? "" : nextVisibleNote?.note ?? ""

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

  const loadRanking = () => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY)
      if (!raw) {
        setRanking([])
        return
      }
      const parsed = JSON.parse(raw) as RankingEntry[]
      setRanking(Array.isArray(parsed) ? parsed.slice(0, 3) : [])
    } catch {
      setRanking([])
    }
  }

  const saveRanking = (entries: RankingEntry[]) => {
    const next = entries
      .slice()
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)

    setRanking(next)

    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    } catch {}
  }

  const maybeRegisterScore = (score: number) => {
    if (score <= 0) {
      window.setTimeout(() => {
        alert(`スコアは ${score} でした。`)
      }, 50)
      return
    }

    const currentRanking = ranking.slice().sort((a, b) => b.score - a.score)
    const qualifies =
      currentRanking.length < 3 ||
      score > (currentRanking[currentRanking.length - 1]?.score ?? -1)

    if (!qualifies) {
      window.setTimeout(() => {
        alert(`スコアは ${score} でした。`)
      }, 50)
      return
    }

    const input = window.prompt("ハイスコア入り！ 名前を入力してください。", "AAA")
    const name = (input || "NONAME").trim().slice(0, 10) || "NONAME"
    const next = [...currentRanking, { name, score }]

    saveRanking(next)

    window.setTimeout(() => {
      alert(`${name} のスコア ${score} を登録しました。`)
    }, 50)
  }

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

  const clearScoreEligibility = () => {
    fullRunScoreEligibleRef.current = false
  }

  const getStepMs = (length = 1) => {
    const base = Math.round(60000 / tempo)
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

  const finishFullRunIfNeeded = () => {
    if (fullRunScoreEligibleRef.current) {
      const finalScore = successCount
      fullRunScoreEligibleRef.current = false
      maybeRegisterScore(finalScore)
    }
  }

  const moveToNextNote = () => {
    if (playMode === "phrase") {
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
    finishFullRunIfNeeded()
  }

  const handleStart = async () => {
    clearPlaybackTimer()
    clearCountdownTimer()
    setCountdown(null)
    setIsPlaying(false)
    clearScoreEligibility()
    setPlayMode("full")
    setPhraseIndex(0)
    setNoteIndex(0)
    setSuccessCount(0)
    setJudgeState("idle")
    await ensureAudioReady()
    setScreen("practice")
  }

  const handlePrevPhrase = () => {
    clearPlaybackTimer()
    clearCountdownTimer()
    setCountdown(null)
    setIsPlaying(false)
    clearScoreEligibility()
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
    clearScoreEligibility()
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
    clearScoreEligibility()
    moveToNextNote()
  }

  const handleBack = () => {
    clearPlaybackTimer()
    clearCountdownTimer()
    setCountdown(null)
    setIsPlaying(false)
    clearScoreEligibility()

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

  const startMic = async () => {
    if (isMicEnabled) return

    try {
      setIsMicPreparing(true)
      clearPlaybackTimer()
      clearCountdownTimer()
      setCountdown(null)
      setIsPlaying(false)
      clearScoreEligibility()

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
    clearScoreEligibility()
  }

  const startPlaybackWithCountdown = async () => {
    clearPlaybackTimer()
    clearCountdownTimer()
    setIsPlaying(false)

    if (playMode !== "phrase") {
      setPhraseIndex(0)
      setNoteIndex(0)
    }

    if (playMode === "full" && isMicEnabled) {
      setSuccessCount(0)
      fullRunScoreEligibleRef.current = true
    } else {
      clearScoreEligibility()
    }

    await ensureAudioReady()

    if (!isMicEnabled) {
      setIsPlaying(true)
      return
    }

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
    if (typeof window !== "undefined") {
      loadRanking()
    }
  }, [])

  useEffect(() => {
    stableHitCountRef.current = 0
    noteSolvedRef.current = false
    setJudgeState("idle")
  }, [phraseIndex, noteIndex])

  useEffect(() => {
    if (screen !== "practice") return
    if (!isPlaying) return

    if (isMicEnabled) {
      void playClick()
    } else {
      void playNote(current.note, getStepMs(current.length))
    }
  }, [
    screen,
    isPlaying,
    isMicEnabled,
    phraseIndex,
    noteIndex,
    tempo,
    current.note,
    current.length,
  ])

  useEffect(() => {
    clearPlaybackTimer()

    if (screen !== "practice" || !isPlaying) return

    const stepMs = getStepMs(current.length)

    timerRef.current = window.setTimeout(() => {
      moveToNextNote()
    }, stepMs)

    return () => {
      clearPlaybackTimer()
    }
  }, [screen, isPlaying, playMode, phraseIndex, noteIndex, tempo, current.length, successCount])

  useEffect(() => {
    if (!isMicEnabled || !analyserRef.current || !micAudioContextRef.current) return

    const analyser = analyserRef.current
    const sampleRate = micAudioContextRef.current.sampleRate
    const buffer = new Float32Array(analyser.fftSize)

    const tick = () => {
      analyser.getFloatTimeDomainData(buffer)
      const freq = getAutocorrelatedPitch(buffer, sampleRate)
      const note = freq > 0 ? closestNoteFromFrequency(freq) : ""
      setDetectedNote(note)

      if (!isPlaying || current.note === "休符") {
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
  }, [isMicEnabled, isPlaying, current.note])

  useEffect(() => {
    if (screen !== "practice") return

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
  }, [screen, playMode, noteIndex, phraseIndex, isMicEnabled])

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
        <div className="w-full max-w-[920px] rounded-[28px] border border-white/10 bg-[#f8f4ea] px-10 py-8 text-center text-slate-900 shadow-2xl">
          <HomeOtamatoneFace />

          <p className="mb-3 text-lg font-bold text-slate-700">
            オタマトーンの準備はできましたか？
          </p>

          <div className="mx-auto mb-6 max-w-[360px] rounded-[20px] bg-white p-4 text-left">
            <p className="mb-3 text-center text-sm font-black tracking-wide text-slate-700">
              HIGH SCORE
            </p>

            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, index) => {
                const item = ranking[index]
                return (
                  <div
                    key={index}
                    className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-2"
                  >
                    <span className="text-sm font-black text-slate-500">
                      {index + 1}位
                    </span>
                    <span className="min-w-[120px] text-center text-sm font-bold text-slate-800">
                      {item?.name ?? "---"}
                    </span>
                    <span className="text-sm font-black text-[#10234d]">
                      {item?.score ?? 0}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>

          {isPreparingAudio && (
            <div className="mb-5 flex items-center justify-center gap-2 rounded-2xl bg-[#fff7df] px-5 py-3 text-center text-sm font-bold text-slate-700">
              <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-slate-400/40 border-t-slate-700" />
              音を準備しています…
            </div>
          )}

          <button
            onClick={() => void handleStart()}
            className="cursor-pointer rounded-full bg-[#3f8cff] px-8 py-4 text-xl font-bold text-white shadow-lg disabled:opacity-70"
            disabled={isPreparingAudio}
          >
            {isPreparingAudio ? "準備中…" : "OK！"}
          </button>
        </div>
      </main>
    )
  }

  return (
    <main className="h-screen overflow-hidden bg-[#10234d] px-4 py-4 text-white">
      <div className="mx-auto grid h-[calc(100vh-32px)] max-w-[1560px] grid-cols-[240px_minmax(0,1fr)_340px] gap-0">
        <section className="rounded-l-[24px] border border-white/10 bg-[#f8f4ea] p-4 text-slate-900 shadow-2xl">
          <div className="flex h-full items-center justify-center rounded-[20px] bg-[#fff7df]">
            <div className="relative flex h-full min-h-[640px] w-[170px] items-end justify-center rounded-full bg-[#f3ead1] px-4 py-6">
              <div className="relative h-full w-10 rounded-full bg-[#10234d] shadow-inner">
                <div className="absolute inset-x-0 top-0 bottom-0 flex flex-col justify-between py-4">
                  {Array.from({ length: 10 }).map((_, i) => (
                    <div key={i} className="h-px w-full bg-white/10" />
                  ))}
                </div>

                {current.note !== "休符" && (
                  <div
                    className="absolute left-1/2 h-3 w-16 -translate-x-1/2 rounded-full bg-[#ffd54a] shadow-[0_0_0_6px_rgba(255,213,74,0.18)]"
                    style={{ top: `calc(${current.pos}% - 6px)` }}
                  />
                )}
              </div>

              <div className="absolute bottom-0 left-1/2 h-[92px] w-[106px] -translate-x-1/2 translate-y-8 rounded-[46%] border-4 border-slate-700 bg-[#fffaf0]">
                <div className="absolute left-[30px] top-[28px] h-[8px] w-[8px] rounded-full bg-slate-700" />
                <div className="absolute right-[30px] top-[28px] h-[8px] w-[8px] rounded-full bg-slate-700" />
                <div className="absolute left-0 top-[46px] h-[2px] w-full bg-slate-700" />
              </div>
            </div>
          </div>
        </section>

        <section className="border-y border-r border-white/10 bg-[#f8f4ea] p-4 text-slate-900 shadow-2xl">
          <div className="flex h-full flex-col">
            <div className="mb-4 flex items-center justify-center gap-3">
              <PixelInventorFace />
              <p className="text-base font-bold text-slate-700">
                ◆ オタマトーンでエイトメロディーズを ひけるんだ。
              </p>
            </div>

            <div className="mb-4 rounded-[20px] bg-white p-4">
              <div className="mb-2 flex items-center justify-center gap-4">
                <p className="text-base font-bold text-slate-700">進行</p>
                <p className="text-base font-black text-slate-900">
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
                      className={`rounded-xl px-2 py-3 text-center transition ${
                        isCurrent
                          ? "bg-[#ffd54a] text-slate-900 ring-2 ring-[#ffd54a]"
                          : isDone
                          ? "bg-[#eaf4ff] text-slate-900"
                          : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      <p className="text-[10px] font-bold">MELODY</p>
                      <p className="mt-1 text-xl font-black">{index + 1}</p>
                    </div>
                  )
                })}
              </div>

              <div className="mt-3 h-3 w-full overflow-hidden rounded-full bg-slate-200">
                <div
                  className="h-full rounded-full bg-[#3f8cff] transition-all"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>

            <div className="flex flex-1 items-center justify-center rounded-[20px] bg-[#fff7df] p-6">
              <div className="flex w-full max-w-[640px] flex-col gap-5">
                <div className="grid grid-cols-2 gap-4">
                  <div className="rounded-[20px] bg-[#10234d] px-5 py-5 text-center text-white">
                    <p className="text-base font-bold text-white/80">いま押さえる音</p>
                    <p className="mt-2 min-h-[64px] text-4xl font-black leading-none tracking-tight">
                      {visibleCurrentLabel || "-"}
                    </p>
                    <p className="mt-2 text-base font-bold text-white/80">
                      長さ: {current.length}
                    </p>
                  </div>

                  <div className="rounded-[20px] border-4 border-[#3f8cff] bg-[#eaf4ff] px-5 py-5 text-center">
                    <p className="text-base font-bold text-slate-700">つぎの音</p>
                    <p className="mt-2 min-h-[64px] text-4xl font-black leading-none tracking-tight text-slate-900">
                      {visibleNextLabel}
                    </p>
                    <p className="mt-2 text-base font-bold text-slate-600">
                      長さ: {nextVisibleNote?.length ?? 0}
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-center gap-2 pt-1 text-slate-500">
                  <button
                    onClick={handleBack}
                    className="cursor-pointer rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold hover:bg-slate-50"
                  >
                    1音戻る（←）
                  </button>
                  <button
                    onClick={handleNext}
                    className="cursor-pointer rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold hover:bg-slate-50"
                  >
                    1音進む（→）
                  </button>
                  <button
                    onClick={() => void playCurrentNote()}
                    disabled={isMicEnabled}
                    className="cursor-pointer rounded-lg bg-[#10234d] px-3 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {isMicEnabled ? "マイク判定中" : "お手本"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>

        <aside className="ml-3 flex flex-col gap-3 rounded-[24px] border border-white/10 bg-[#f8f4ea] p-4 text-slate-900 shadow-2xl">
          <div className="rounded-[20px] bg-slate-100 p-4">
            <p className="mb-3 text-base font-bold text-slate-700">テンポ</p>
            <div className="flex items-center gap-3 rounded-2xl bg-white px-4 py-3">
              <span className="w-14 rounded-full bg-[#ffd54a] px-3 py-1 text-center text-lg font-black">
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

          <div className="rounded-[20px] bg-slate-100 p-4">
            <p className="mb-3 text-base font-bold text-slate-700">再生モード</p>

            <div className="flex flex-col gap-3">
              <label className="flex cursor-pointer items-center gap-3 rounded-2xl bg-white px-4 py-3">
                <input
                  type="radio"
                  name="playMode"
                  checked={playMode === "full"}
                  onChange={() => {
                    clearPlaybackTimer()
                    clearCountdownTimer()
                    setCountdown(null)
                    setIsPlaying(false)
                    clearScoreEligibility()
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

              <label className="flex cursor-pointer items-center gap-3 rounded-2xl bg-white px-4 py-3">
                <input
                  type="radio"
                  name="playMode"
                  checked={playMode === "phrase"}
                  onChange={() => {
                    clearPlaybackTimer()
                    clearCountdownTimer()
                    setCountdown(null)
                    setIsPlaying(false)
                    clearScoreEligibility()
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
                  className="cursor-pointer flex-1 rounded-lg bg-white px-3 py-2 text-xs font-semibold text-slate-700"
                >
                  前のメロディー
                </button>
                <button
                  onClick={handleNextPhrase}
                  className="cursor-pointer flex-1 rounded-lg bg-white px-3 py-2 text-xs font-semibold text-slate-700"
                >
                  次のメロディー
                </button>
              </div>
            )}
          </div>

          <div className="rounded-[20px] bg-slate-100 p-4">
            <p className="mb-3 text-base font-bold text-slate-700">マイク</p>
            <label className="flex cursor-pointer items-center gap-3 rounded-2xl bg-white px-4 py-3">
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

          <div className="rounded-[20px] bg-white p-4 text-center">
            <p className="mb-2 text-sm font-bold text-slate-500">入力された音</p>
            <p className="min-h-[54px] text-3xl font-black text-slate-900">
              {detectedNote || "-"}
            </p>
          </div>

          <div
            className={`rounded-[20px] p-4 text-center ${
              judgeState === "ok"
                ? "bg-[#dff7df] text-[#1b6b2c]"
                : judgeState === "miss"
                ? "bg-[#ffe2e2] text-[#b33737]"
                : "bg-white text-slate-500"
            }`}
          >
            <p className="mb-2 text-sm font-bold">判定</p>
            <p className="text-4xl font-black">
              {judgeState === "ok"
                ? "OK!"
                : judgeState === "miss"
                ? "MISS"
                : "..."}
            </p>
          </div>

          <div className="rounded-[20px] bg-white p-4 text-center">
            <p className="mb-2 text-sm font-bold text-slate-500">成功数</p>
            <p className="text-4xl font-black text-slate-900">{successCount}</p>
          </div>

          <button
            onClick={handleResetSuccess}
            className="cursor-pointer rounded-[20px] bg-slate-100 px-4 py-3 text-sm font-bold text-slate-700"
          >
            成功数をリセット
          </button>

          <div className="rounded-[20px] bg-slate-100 p-4">
            <p className="mb-3 text-base font-bold text-slate-700">
              再生コントロール
            </p>
            <div className="grid grid-cols-1 gap-3">
              <button
                onClick={() => void startPlaybackWithCountdown()}
                className="cursor-pointer rounded-2xl bg-[#3f8cff] px-4 py-3 text-lg font-bold text-white shadow-sm disabled:opacity-70"
                disabled={isPreparingAudio || isMicPreparing || countdown !== null}
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
                  clearScoreEligibility()
                }}
                className="cursor-pointer rounded-2xl bg-[#3f8cff] px-4 py-3 text-lg font-bold text-white shadow-sm opacity-85"
              >
                停止
              </button>
            </div>

            {(isPreparingAudio || isMicPreparing) && (
              <div className="mt-3 flex items-center justify-center gap-2 rounded-2xl bg-[#fff7df] px-4 py-3 text-center text-sm font-bold text-slate-700">
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