import type { Metadata } from "next"
import "./globals.css"

export const metadata: Metadata = {
  title: "オタマトーンでエイトメロディーズ",
  description: "オタマトーンでエイトメロディーズを練習できるウェブアプリです。",
}

import { Cinzel, Nunito, DotGothic16 } from "next/font/google"

const cinzel = Cinzel({ subsets: ["latin"], weight: ["700", "900"] })
const nunito = Nunito({ subsets: ["latin"], weight: ["400", "700"] })
const dotGothic16 = DotGothic16({
  weight: ["400"],
  subsets: ["latin"],
  variable: "--font-dot-gothic16",
  display: "swap",
  preload: false,
})

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="ja">
      <body className={dotGothic16.variable}>{children}</body>
    </html>
  )
}
