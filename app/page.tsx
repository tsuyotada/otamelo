"use client"

import React, { useEffect } from "react"

/* =========================
   型
========================= */

type Screen = "home" | "stageSelect" | "practice" | "tune"

type StageItem = {
  id: number
  title: string
}

type PreviewItem = {
  id: string
  note: string
  length: number
  isCurrent: boolean
  isNext: boolean
  isPlaceholder?: boolean
  phraseIndex?: number
  noteIndex?: number
}

/* =========================
   ステージ定義
========================= */

const stages: StageItem[] = [
  { id: 1, title: "まずは　オタマトーンをならしてみて" },
  { id: 2, title: "エイトメロディーズの全体を　きいてみて" },
  { id: 3, title: "ひとつめのメロディーを　ひいてみて" },
  { id: 4, title: "ほかのメロディーも　ひいてみて" },
  { id: 5, title: "エイトメロディーズを　とおしで　ひいてみて" },
  { id: 6, title: "本番だ　全体とおして　自分だけでひいてみて" },
]

/* =========================
   ダミーUI（既存のもの使ってOK）
========================= */

function PixelInventorFace() {
  return <div className="h-8 w-8 rounded bg-yellow-300" />
}

/* =========================
   メイン
========================= */

export default function Page() {
  // 既存state想定（名前は合わせてください）
  const [screen, setScreen] = React.useState<Screen>("home")
  const [selectedStage, setSelectedStage] = React.useState(1)

  const [phraseIndex, setPhraseIndex] = React.useState(0)
  const [noteIndex, setNoteIndex] = React.useState(0)

  const [isPlaying, setIsPlaying] = React.useState(false)
  const [isPreparingAudio, setIsPreparingAudio] = React.useState(false)

  const [detectedNote, setDetectedNote] = React.useState("")
  const [judgeState, setJudgeState] = React.useState<"idle" | "ok" | "miss">("idle")

  /* =========================
     キーボード操作（ステージ3〜5）
  ========================= */

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

  /* =========================
     操作関数（仮）
  ========================= */

  const handleOpenStage = async () => {
    setScreen("stageSelect")
  }

  const handleSelectStage = (id: number) => {
    setSelectedStage(id)
    setScreen("practice")
  }

  const handleBack = () => {
    setNoteIndex((n) => Math.max(0, n - 1))
  }

  const handleNext = () => {
    setNoteIndex((n) => n + 1)
  }

  const handlePreviewSelect = (item: PreviewItem) => {
    if (item.noteIndex === undefined) return
    setNoteIndex(item.noteIndex)
  }

  /* =========================
     ホーム
  ========================= */

  if (screen === "home") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#0A1F52] px-6 py-8 text-white">
        <div className="w-full max-w-[860px] rounded-[36px] border border-white/10 bg-[#102A68] px-8 py-10 text-center shadow-[0_20px_50px_rgba(0,0,0,0.28)]">
          <div className="mx-auto flex max-w-[560px] flex-col items-center">
            <img
              src="/otamatone-logo.svg"
              className="w-[320px]"
              alt="logo"
            />

            <p className="mt-8 text-sm font-black tracking-[0.18em] text-white">
              EIGHT MELODIES
            </p>

            <p className="mt-5 text-sm font-bold text-white">
              すこしずつ　音をならして、
              <br />
              さいごは　とおしで　ひいてみよう
            </p>

            <button
              onClick={handleOpenStage}
              className="mt-8 rounded-[24px] bg-[#FFD54A] px-8 py-4 text-xl font-black text-[#1F325C]"
            >
              START
            </button>
          </div>
        </div>
      </main>
    )
  }

  /* =========================
     ステージ選択
  ========================= */

  if (screen === "stageSelect") {
    return (
      <main className="min-h-screen bg-[#0A1F52] px-4 py-6 text-white">
        <div className="mx-auto max-w-[900px]">
          <div className="space-y-4">
            {stages.map((stage, index) => (
              <div key={stage.id}>
                <button
                  onClick={() => handleSelectStage(stage.id)}
                  className="w-full rounded-[24px] bg-white px-6 py-5 text-left text-black"
                >
                  <p className="font-black text-blue-500">
                    STAGE {stage.id}
                  </p>
                  <p className="font-black">{stage.title}</p>
                </button>

                {index !== stages.length - 1 && (
                  <div className="mx-auto h-6 w-1 bg-yellow-400" />
                )}
              </div>
            ))}
          </div>
        </div>
      </main>
    )
  }

  /* =========================
     ステージ2（聴くだけ）
  ========================= */

  if (selectedStage === 2) {
    return (
      <main className="p-6">
        <div className="space-y-6">
          <div className="text-lg font-bold">
            まずは全体をきいて、イメージをもちましょう。
          </div>

          <button className="bg-blue-500 px-4 py-3 text-white">
            きいてみる
          </button>

          <div className="text-5xl font-black">
            {detectedNote || "-"}
          </div>
        </div>
      </main>
    )
  }

  /* =========================
     ステージ3〜5
  ========================= */

  if ([3, 4, 5].includes(selectedStage)) {
    return (
      <main className="p-6">
        <div className="grid grid-cols-6 gap-2">
          {[...Array(6)].map((_, i) => {
            const item: PreviewItem = {
              id: String(i),
              note: "ド",
              length: 1,
              isCurrent: i === noteIndex,
              isNext: i === noteIndex + 1,
              noteIndex: i,
            }

            return (
              <button
                key={i}
                onClick={() => handlePreviewSelect(item)}
                className={`p-4 border ${
                  item.isCurrent ? "bg-yellow-300" : ""
                }`}
              >
                {item.note}
              </button>
            )
          })}
        </div>

        <div className="mt-6 flex gap-3">
          <button onClick={handleBack}>←</button>
          <button onClick={handleNext}>→</button>
        </div>
      </main>
    )
  }

  /* =========================
     ステージ6（BOSS）
  ========================= */

  if (selectedStage === 6) {
    return (
      <main className="min-h-screen bg-[#05070D] px-6 py-6 text-white">
        <div className="max-w-[1100px] mx-auto">
          <div className="mb-4 text-red-400 font-black">
            本番モード（MIC ON）
          </div>

          <div className="flex gap-8">
            {/* スポットライト */}
            <div className="w-[200px] h-[400px] rounded-full bg-[radial-gradient(circle,rgba(255,255,255,0.3),transparent)]" />

            <div className="flex-1">
              <div className="text-3xl">{detectedNote}</div>

              <div className="grid grid-cols-3 gap-3 mt-4">
                <div>判定: {judgeState}</div>
                <div>スコア: 0</div>
                <div>成功: 0</div>
              </div>

              <button className="mt-6 bg-yellow-400 px-6 py-3 text-black font-black">
                本番スタート
              </button>
            </div>
          </div>
        </div>
      </main>
    )
  }

  return null
}