"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { makeNote, phrases } from "@/src/data/eightMelodies"

const noteToFreq: Record<string, number> = {
  "低いド": 130.81,
  "低いド#": 138.59,
  "低いレ": 146.83,
  "低いレ#": 155.56,
  "低いミ": 164.81,
  "低いファ": 174.61,
  "低いファ#": 185.0,
  "低いソ": 196.0,
  "低いソ#": 207.65,
  "低いラ": 220.0,
  "低いラ#": 233.08,
  "低いシ": 246.94,
  "ド": 261.63,
  "ド#": 277.18,
  "レ": 293.66,
  "レ#": 311.13,
  "ミ": 329.63,
  "ファ": 349.23,
  "ファ#": 369.99,
  "ソ": 392.0,
  "ソ#": 415.3,
  "ラ": 440.0,
  "ラ#": 466.16,
  "シ": 493.88,
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
}

type Screen = "home" | "practice"
type PlayMode = "phrase" | "full"

export default function Page() {
  const [screen, setScreen] = useState<Screen>("home")
  const [phraseIndex, setPhraseIndex] = useState(0)
  const [noteIndex, setNoteIndex] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [tempo, setTempo] = useState(80)
  const [playMode, setPlayMode] = useState<PlayMode>("full")
  const [isPreparingAudio, setIsPreparingAudio] = useState(false)

  const audioContextRef = useRef<AudioContext | null>(null)
  const timerRef = useRef<number | null>(null)

  const safePhrases = useMemo(
    () =>
      phrases.map((phrase, index) => ({
        ...phrase,
        title: phrase.title || `メロディー${index + 1}`,
        notes: phrase.notes.length > 0 ? phrase.notes : [makeNote("ド")],
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

    if (playMode === "full") {
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
  const visibleNextLabel = nextVisibleNote?.note === "休符" ? "" : nextVisibleNote?.note ?? ""

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

  const playCurrentNote = async () => {
    await playNote(current.note, getStepMs(current.length))
  }

  const handleStart = async () => {
    clearPlaybackTimer()
    setIsPlaying(false)
    setPlayMode("full")
    setPhraseIndex(0)
    setNoteIndex(0)
    await ensureAudioReady()
    setScreen("practice")
  }

  const handlePrevPhrase = () => {
    clearPlaybackTimer()
    setIsPlaying(false)
    setPlayMode("phrase")
    setPhraseIndex((prev) => Math.max(0, prev - 1))
    setNoteIndex(0)
  }

  const handleNextPhrase = () => {
    clearPlaybackTimer()
    setIsPlaying(false)
    setPlayMode("phrase")
    setPhraseIndex((prev) => Math.min(safePhrases.length - 1, prev + 1))
    setNoteIndex(0)
  }

  const handleNext = () => {
    clearPlaybackTimer()
    setIsPlaying(false)

    if (playMode === "full") {
      if (noteIndex < safeNotes.length - 1) {
        setNoteIndex((prev) => prev + 1)
        return
      }

      if (phraseIndex < safePhrases.length - 1) {
        setPhraseIndex((prev) => prev + 1)
        setNoteIndex(0)
      }

      return
    }

    if (noteIndex < safeNotes.length - 1) {
      setNoteIndex((prev) => prev + 1)
    } else {
      setNoteIndex(0)
    }
  }

  const handleBack = () => {
    clearPlaybackTimer()
    setIsPlaying(false)

    if (noteIndex > 0) {
      setNoteIndex((prev) => prev - 1)
      return
    }

    if (playMode === "full" && phraseIndex > 0) {
      const prevPhraseIndex = phraseIndex - 1
      const prevPhrase = safePhrases[prevPhraseIndex]
      setPhraseIndex(prevPhraseIndex)
      setNoteIndex(prevPhrase.notes.length - 1)
      return
    }

    setNoteIndex(0)
  }

  useEffect(() => {
    clearPlaybackTimer()
    setNoteIndex(0)
  }, [phraseIndex])

  useEffect(() => {
    if (screen !== "practice") return

    const activePhrase = safePhrases[phraseIndex]
    const activeNote = activePhrase.notes[noteIndex] ?? activePhrase.notes[0]

    void playNote(activeNote.note, getStepMs(activeNote.length))
  }, [screen, phraseIndex, noteIndex, tempo, safePhrases])

  useEffect(() => {
    clearPlaybackTimer()

    if (screen !== "practice" || !isPlaying) return

    const activePhrase = safePhrases[phraseIndex]
    const activeNote = activePhrase.notes[noteIndex] ?? activePhrase.notes[0]
    const stepMs = getStepMs(activeNote.length)

    timerRef.current = window.setTimeout(() => {
      if (playMode === "full") {
        if (noteIndex < activePhrase.notes.length - 1) {
          setNoteIndex((prev) => prev + 1)
          return
        }

        if (phraseIndex < safePhrases.length - 1) {
          setPhraseIndex((prev) => prev + 1)
          setNoteIndex(0)
          return
        }

        setIsPlaying(false)
        return
      }

      if (noteIndex < activePhrase.notes.length - 1) {
        setNoteIndex((prev) => prev + 1)
      } else {
        setNoteIndex(0)
      }
    }, stepMs)

    return () => {
      clearPlaybackTimer()
    }
  }, [isPlaying, screen, playMode, phraseIndex, noteIndex, tempo, safePhrases])

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
        setIsPlaying((prev) => !prev)
      }
    }

    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [screen, playMode, noteIndex, phraseIndex, safeNotes.length])

  if (screen === "home") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#0d1b3d] px-6 text-white">
        <div className="w-full max-w-[900px] rounded-[28px] border border-white/10 bg-[#f8f4ea] px-10 py-8 text-center text-slate-900 shadow-2xl">
          <p className="mb-3 text-lg font-bold text-slate-700">オタマトーンの準備はできましたか？</p>
          

          {isPreparingAudio && (
            <div className="mb-5 rounded-2xl bg-[#fff7df] px-5 py-3 text-center text-sm font-bold text-slate-700">
              音を準備しています…
            </div>
          )}

          <button
            onClick={() => void handleStart()}
            className="rounded-full bg-[#3aa7f2] px-8 py-4 text-xl font-bold text-white shadow-lg disabled:opacity-70"
            disabled={isPreparingAudio}
          >
            {isPreparingAudio ? "準備中…" : "開始"}
          </button>
        </div>
      </main>
    )
  }

  return (
    <main className="h-screen overflow-hidden bg-[#0d1b3d] px-4 py-4 text-white">
      <div className="mx-auto grid h-[calc(100vh-32px)] max-w-[1560px] grid-cols-[2.25fr_0.85fr] gap-3">
        <section className="flex flex-col rounded-[24px] border border-white/10 bg-[#f8f4ea] p-4 text-slate-900 shadow-2xl">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="text-base font-bold text-slate-700">オタマトーンでエイトメロディーズをひいてみよう
              </p>

            </div>

            <button
              onClick={() => void playCurrentNote()}
              className="rounded-full bg-[#10234d] px-4 py-2 text-sm font-bold text-white"
            >
              お手本
            </button>
          </div>

          <div className="mb-4 rounded-[20px] bg-white p-4">
            <div className="mb-2 flex items-center justify-between">
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
                        ? "bg-[#ffd54a] text-slate-900 ring-2 ring-[#f3c842]"
                        : isDone
                        ? "bg-[#bfe3ff] text-slate-900"
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
                className="h-full rounded-full bg-[#3aa7f2] transition-all"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>

          <div className="grid flex-1 grid-cols-[1.35fr_0.9fr] gap-4">
            <div className="flex items-center justify-center gap-6 rounded-[20px] bg-[#fff7df] p-4">
              <div className="relative flex h-full min-h-[390px] w-[110px] items-end justify-center rounded-full bg-[#f3ead1] px-4 py-6">
                <div className="relative h-full w-9 rounded-full bg-[#18253f] shadow-inner">
                  <div className="absolute inset-x-0 top-0 bottom-0 flex flex-col justify-between py-4">
                    {Array.from({ length: 8 }).map((_, i) => (
                      <div key={i} className="h-px w-full bg-white/10" />
                    ))}
                  </div>

                  {current.note !== "休符" && (
                    <div
                      className="absolute left-1/2 h-3 w-14 -translate-x-1/2 rounded-full bg-[#ffd54a] shadow-[0_0_0_6px_rgba(255,213,74,0.18)]"
                      style={{ bottom: `calc(${current.pos}% - 6px)` }}
                    />
                  )}
                </div>

                <div className="absolute bottom-0 left-1/2 h-18 w-18 -translate-x-1/2 translate-y-7 rounded-full border-4 border-slate-700 bg-[#fffaf0]" />
              </div>

              <div className="flex min-w-[290px] flex-col gap-4">
                <div className="rounded-[20px] bg-[#10234d] px-5 py-4 text-center text-white">
                  <p className="text-base font-bold text-white/80">いま押さえる音</p>
                  <p className="mt-2 min-h-[56px] text-5xl font-black leading-none tracking-tight">
                    {visibleCurrentLabel}
                  </p>
                  <p className="mt-2 text-base font-bold text-white/80">
                    長さ: {current.length}
                  </p>
                </div>

                <div className="rounded-[20px] border-4 border-[#b7ddfa] bg-[#eaf6ff] px-5 py-4 text-center">
                  <p className="text-base font-bold text-slate-700">つぎの音</p>
                  <p className="mt-2 min-h-[52px] text-4xl font-black leading-none tracking-tight text-slate-900">
                    {visibleNextLabel}
                  </p>
                  <p className="mt-2 text-base font-bold text-slate-600">
                    長さ: {nextVisibleNote?.length ?? 0}
                  </p>
                </div>

                <div className="flex items-center justify-center gap-2 pt-1 text-slate-500">
                  <button
                    onClick={handleBack}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold hover:bg-slate-50"
                  >
                    1音戻る（←）
                  </button>
                  <button
                    onClick={handleNext}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold hover:bg-slate-50"
                  >
                    1音進む（→）
                  </button>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-3">
              <div className="rounded-[20px] bg-white p-4">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-base font-bold text-slate-700">進行状況</p>
                  <p className="text-base font-black text-slate-900">
                    {passedNotes} / {totalNotes}
                  </p>
                </div>

                <div className="h-3 w-full overflow-hidden rounded-full bg-slate-200">
                  <div
                    className="h-full rounded-full bg-[#3aa7f2] transition-all"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>

                <p className="mt-3 text-sm font-semibold text-slate-600">
                  曲全体進行率: {Math.round(progressPercent)}%
                </p>
              </div>
            </div>
          </div>
        </section>

        <aside className="flex flex-col gap-3 rounded-[24px] border border-white/10 bg-[#f8f4ea] p-4 text-slate-900 shadow-2xl">
          <div className="rounded-[20px] bg-slate-100 p-4">
            <p className="mb-3 text-base font-bold text-slate-700">テンポ</p>
            <div className="flex items-center gap-3 rounded-2xl bg-white px-4 py-3">
              <span className="w-14 rounded-full bg-[#ffd54a] px-3 py-1 text-center text-lg font-black">
                {tempo}
              </span>
              <input
                type="range"
                min={40}
                max={180}
                step={5}
                value={tempo}
                onChange={(e) => setTempo(Number(e.target.value))}
                className="flex-1"
              />
            </div>
          </div>

          <div className="rounded-[20px] bg-slate-100 p-4">
            <p className="mb-3 text-base font-bold text-slate-700">再生モード</p>
 <label className="mt-3 flex cursor-pointer items-center gap-3 rounded-2xl bg-white px-4 py-3">
              <input
                type="radio"
                name="playMode"
                checked={playMode === "full"}
                onChange={() => {
                  clearPlaybackTimer()
                  setIsPlaying(false)
                  setPlayMode("full")
                  setPhraseIndex(0)
                  setNoteIndex(0)
                }}
                className="h-4 w-4"
              />
              <span className="text-sm font-bold text-slate-800">全体通し再生</span>
            </label>
            <label className="flex cursor-pointer items-center gap-3 rounded-2xl bg-white px-4 py-3">
              <input
                type="radio"
                name="playMode"
                checked={playMode === "phrase"}
                onChange={() => {
                  clearPlaybackTimer()
                  setIsPlaying(false)
                  setPlayMode("phrase")
                }}
                className="h-4 w-4"
              />
              <br></>
              <span className="text-sm font-bold text-slate-800">メロディーごと再生</span>
            </label>

            {playMode === "phrase" && (
              <div className="mt-3 flex items-center gap-2">
                <button
                  onClick={handlePrevPhrase}
                  className="flex-1 rounded-lg bg-white px-3 py-2 text-xs font-semibold text-slate-700"
                >
                  前のメロディー
                </button>
                <button
                  onClick={handleNextPhrase}
                  className="flex-1 rounded-lg bg-white px-3 py-2 text-xs font-semibold text-slate-700"
                >
                  次のメロディー
                </button>
              </div>
            )}

           
          </div>

          <div className="rounded-[20px] bg-slate-100 p-4">
            <p className="mb-3 text-base font-bold text-slate-700">コントロール</p>
            <div className="grid grid-cols-1 gap-3">
              <button
                onClick={() => {
                  clearPlaybackTimer()
                  if (playMode === "full") {
                    setPhraseIndex(0)
                    setNoteIndex(0)
                  }
                  void ensureAudioReady().then(() => {
                    setIsPlaying(true)
                  })
                }}
                className="rounded-2xl bg-[#58c96b] px-4 py-3 text-lg font-bold text-white shadow-sm disabled:opacity-70"
                disabled={isPreparingAudio}
              >
                {isPreparingAudio ? "準備中…" : "再生"}
              </button>

              <button
                onClick={() => {
                  clearPlaybackTimer()
                  setIsPlaying(false)
                }}
                className="rounded-2xl bg-[#e25b4e] px-4 py-3 text-lg font-bold text-white shadow-sm"
              >
                停止
              </button>
            </div>

            {isPreparingAudio && (
              <div className="mt-3 rounded-2xl bg-[#fff7df] px-4 py-3 text-center text-sm font-bold text-slate-700">
                音を準備しています…
              </div>
            )}
          </div>
        </aside>
      </div>
    </main>
  )
}