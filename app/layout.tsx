import type { Metadata } from "next"
import "./globals.css"

export const metadata: Metadata = {
  title: "オタマトーンでエイトメロディーズ",
  description: "オタマトーンでエイトメロディーズを練習できるウェブアプリです。",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  )
}

import { Cinzel, Nunito } from "next/font/google"

const cinzel = Cinzel({ subsets: ["latin"], weight: ["700", "900"] })
const nunito = Nunito({ subsets: ["latin"], weight: ["400", "700"] })