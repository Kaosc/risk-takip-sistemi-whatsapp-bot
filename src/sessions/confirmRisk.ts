import { Message, MessageMedia } from "whatsapp-web.js"
import { FieldValue } from "firebase-admin/firestore"

import { getDb } from "../firebase/index"
import { formatDate } from "../lib/date"

type ConfirmRiskStep = "confirm" | "done"

async function fetchRandomPendingRisk(): Promise<(Risk & { id: string }) | null> {
	const db = getDb()
	const snapshot = await db.collection("risks").where("status", "==", "pending").limit(10).get()
	if (snapshot.empty) return null
	const docs = snapshot.docs
	const doc = docs[Math.floor(Math.random() * docs.length)]
	return { id: doc.id, ...doc.data() } as Risk & { id: string }
}

function buildRiskDetails(risk: Risk): string {
	const lines = [
		"● Onaylanacak Risk Detayları:",
		`● Tür: ${risk.type}`,
		`● Açıklama: ${risk.description}`,
		`● Şiddet: ${risk.severity}`,
	]
	if (risk.type === "accident" && risk.accidentDetails) {
		const d = risk.accidentDetails
		lines.push("👥 Kaza Detayları:")
		lines.push(`   • Karışan Kişiler: ${d.involvedPersons.join(", ")}`)
		lines.push(`   • Yaralanma Durumu: ${d.injuryStatus}`)
		lines.push(`   • İlk Yardım: ${d.firstAidProvided ? "Evet" : "Hayır"}`)
	}
	lines.push("", "✅ Tamamlanma Bilgileri:")
	lines.push(`   • Bitiş Tarihi: ${formatDate(risk.completedAt)}`)
	lines.push(`   • Notlar: ${risk.completionNotes || "—"}`)
	lines.push(`   • Sonra Görselleri: ${(risk.afterImages || []).length} adet`)
	return lines.join("\n")
}

export function createConfirmRiskSession(): Session {
	let currentStep: ConfirmRiskStep = "done"
	let aborted = false
	let currentRisk: (Risk & { id: string }) | null = null

	async function reply(message: Message, content: string): Promise<Message> {
		return message.reply(content)
	}

	async function sendMedia(message: Message, url: string, caption?: string): Promise<boolean> {
		try {
			const media = await MessageMedia.fromUrl(url)
			await message.reply(media, message.from, { caption })
			return true
		} catch (error) {
			console.error("Görsel gönderilemedi:", error)
			return false
		}
	}

	async function showRiskDetails(message: Message, risk: Risk): Promise<void> {
		const caption = buildRiskDetails(risk)
		const firstImage = risk.images?.[0]
		const sentFirst = firstImage ? await sendMedia(message, firstImage, caption) : false
		if (!sentFirst) {
			await reply(message, caption)
		}

		const afterImages = risk.afterImages || []
		const afterLimit = Math.min(afterImages.length, 3)
		for (let i = 0; i < afterLimit; i++) {
			await sendMedia(message, afterImages[i], `📸 İşlem sonrası görsel (${i + 1}/${afterImages.length})`)
		}
	}

	async function confirmRisk(): Promise<boolean> {
		if (!currentRisk) return false
		const db = getDb()
		try {
			await db.collection("risks").doc(currentRisk.id).update({
				status: "completed",
				updatedAt: FieldValue.serverTimestamp(),
			})
			return true
		} catch (error) {
			console.error("Risk onaylanırken hata oluştu:", error)
			return false
		}
	}

	return {
		async start(message: Message): Promise<string> {
			currentRisk = await fetchRandomPendingRisk()
			if (!currentRisk) {
				aborted = true
				currentStep = "done"
				return "❌ Onay bekleyen bir risk bulunmuyor."
			}

			await showRiskDetails(message, currentRisk)

			currentStep = "confirm"
			return "📋 Görev Onaylansın mı? (E/H)"
		},

		async handle({ message }: SessionContext): Promise<SessionOutcome> {
			if (aborted) {
				await reply(message, "🚫 Bu oturumda işlem yapılamaz. Yeniden başlatmak için 'menu' yazınız.")
				return "completed"
			}

			const text = message.body.trim()

			switch (currentStep) {
				case "confirm": {
					const answer = text.toLocaleUpperCase("tr")
					if (answer === "E") {
						const success = await confirmRisk()
						if (success) {
							currentStep = "done"
							await reply(message, "✅ Risk tamamlanmış olarak onaylandı.")
							return "completed"
						}
						await reply(message, "❌ Risk onaylanırken bir hata oluştu. Lütfen tekrar deneyiniz veya '!iptal' yazınız.")
						return "handled"
					}

					if (answer === "H") {
						currentStep = "done"
						await reply(message, "❌ Risk onayı iptal edildi.")
						return "completed"
					}

					await reply(message, "❌ Geçersiz seçim. Lütfen 'E' veya 'H' giriniz.")
					return "handled"
				}

				default:
					return "handled"
			}
		},
	}
}
