import type { NextRequest } from "next/server"
import { Resend } from "resend"

export async function POST(request: NextRequest) {
  const fromEmail = process.env.CONTACT_FROM_EMAIL
  if (!fromEmail) {
    console.error("CONTACT_FROM_EMAIL is not set")
    return Response.json({ error: "Server configuration error" }, { status: 500 })
  }

  let body: { name?: string; email?: string; message?: string }
  try {
    body = (await request.json()) as { name?: string; email?: string; message?: string }
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 })
  }

  const name = (body.name ?? "").trim()
  const email = (body.email ?? "").trim()
  const message = (body.message ?? "").trim()

  if (!message) {
    return Response.json({ error: "Message is required" }, { status: 400 })
  }

  const resend = new Resend(process.env.RESEND_API_KEY)

  const textBody = [
    `お名前：${name || "（未入力）"}`,
    `メールアドレス：${email || "（未入力）"}`,
    "",
    "メッセージ：",
    message,
  ].join("\n")

  try {
    await resend.emails.send({
      from: fromEmail,
      to: "info@arti.llc",
      ...(email ? { replyTo: email } : {}),
      subject: "オタマトーン練習アプリへのお問い合わせ",
      text: textBody,
    })
    return Response.json({ ok: true })
  } catch (err) {
    console.error("Resend error:", err)
    return Response.json({ error: "Failed to send email" }, { status: 500 })
  }
}
