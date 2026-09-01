import { Message, MessageMedia } from "whatsapp-web.js"
import { FieldValue } from "firebase-admin/firestore"

import { getDb } from "../firebase/index"
import { uploadImages } from "../firebase/storage"

type CompleteRiskStep = "completionNotes" | "afterImages" | "done"

async function fetchRandomInProgressRisk(): Promise<(Risk & { id: string }) | null> {
	const db = getDb()
	const snapshot = await db.collection("risks").where("status", "==", "inprogress").limit(10).get()
	if (snapshot.empty) return null
	const docs = snapshot.docs
	const doc = docs[Math.floor(Math.random() * docs.length)]
	return { id: doc.id, ...doc.data() } as Risk & { id: string }
}

function buildRiskDetails(risk: Risk): string {
	const lines = [
		"● Tamamlanacak Risk Detayları:",
		`● Tür: ${risk.type}`,
		`● Açıklama: ${risk.description}`,
		`● Şiddet: ${risk.severity}`,
	]
	if (risk.taskDescription) {
		lines.push(`● Görev Tanımı: ${risk.taskDescription}`)
	}
	if (risk.type === "accident" && risk.accidentDetails) {
		const d = risk.accidentDetails
		lines.push("👥 Kaza Detayları:")
		lines.push(`   • Karışan Kişiler: ${d.involvedPersons.join(", ")}`)
		lines.push(`   • Yaralanma Durumu: ${d.injuryStatus}`)
		lines.push(`   • İlk Yardım: ${d.firstAidProvided ? "Evet" : "Hayır"}`)
	}
	return lines.join("\n")
}

export function createCompleteRiskSession(): Session {
	let currentStep: CompleteRiskStep = "done"
	let aborted = false
	let currentRisk: (Risk & { id: string }) | null = null
	let completionNotes = ""
	let afterImages: { data: string; mimetype: string }[] = []

	async function reply(message: Message, content: string): Promise<Message> {
		return message.reply(content)
	}

	async function showRiskDetails(message: Message, risk: Risk): Promise<void> {
		const caption = buildRiskDetails(risk)
		const firstImage = risk.images?.[0]
		if (firstImage) {
			try {
				const media = await MessageMedia.fromUrl(firstImage)
				await message.reply(media, message.from, { caption })
				return
			} catch (error) {
				console.error("Risk görseli gönderilemedi:", error)
			}
		}
		await reply(message, caption)
	}

	async function finalize(message: Message): Promise<boolean> {
		if (!currentRisk) return false
		const db = getDb()
		try {
			const collected = afterImages
			let urls: string[] = []

			if (collected.length > 0) {
				await reply(message, "⏳ Görseller yükleniyor... Lütfen bekleyiniz.")
				const result = await uploadImages(collected, `risks/${currentRisk.id}/after`)
				if (result.success) {
					urls = result.urls || []
				} else {
					console.error("uploadImages failed:", result.error)
					await reply(message, "⚠️ Görseller yüklenemedi ancak işleminiz kaydedildi.")
				}
			}

			await db
				.collection("risks")
				.doc(currentRisk.id)
				.update({
					status: "pending",
					completionNotes,
					completedAt: FieldValue.serverTimestamp(),
					...(urls.length > 0 ? { afterImages: urls } : {}),
					updatedAt: FieldValue.serverTimestamp(),
				})
			return true
		} catch (error) {
			console.error("Görev tamamlanırken hata oluştu:", error)
			return false
		}
	}

	return {
		async start(message: Message): Promise<string> {
			currentRisk = await fetchRandomInProgressRisk()
			if (!currentRisk) {
				aborted = true
				currentStep = "done"
				return "❌ Tamamlanmayı bekleyen 'inprogress' durumunda bir risk bulunmuyor."
			}

			await showRiskDetails(message, currentRisk)

			currentStep = "completionNotes"
			return "📝 Yapılan işlemleri açıklayınız (tamamlama notu):"
		},

		async handle({ message }: SessionContext): Promise<SessionOutcome> {
			if (aborted) {
				await reply(message, "🚫 Bu oturumda işlem yapılamaz. Yeniden başlatmak için 'menu' yazınız.")
				return "completed"
			}

			const text = message.body.trim()

			switch (currentStep) {
				case "completionNotes": {
					if (!text) {
						await reply(message, "❌ Tamamlama notu boş olamaz. Lütfen yapılan işlemleri açıklayınız:")
						return "handled"
					}
					completionNotes = text
					currentStep = "afterImages"
					await reply(message, "📷 İşlem sonrası görselleri gönderiniz (isteğe bağlı. Gönderim tamamlandıysa 'Tamam' yazınız.")
					return "handled"
				}

				case "afterImages": {
					if (message.hasMedia) {
						let media: MessageMedia | undefined
						try {
							media = await message.downloadMedia()
						} catch (e) {
							console.error("Görsel indirilirken hata:", e)
							await reply(message, "❌ Görsel indirilirken bir hata oluştu. Lütfen görseli tekrar gönderiniz.")
							return "handled"
						}
						if (!media || !media.mimetype.startsWith("image/")) {
							await reply(message, "❌ Görsel indirilemedi. Lütfen görseli tekrar gönderiniz.")
							return "handled"
						}
						afterImages.push({ data: media.data, mimetype: media.mimetype })
						await reply(
							message,
							`📷 ${afterImages.length} görsel alındı.\nBaşka görsel ekleyebilir veya işlem tamamlamak için 'Tamam' yazabilirsiniz.`,
						)
						return "handled"
					}

					if (text.toLowerCase() === "tamam") {
						const success = await finalize(message)
						if (success) {
							currentStep = "done"
							await reply(message, "✅ Görev tamamlandı! Risk onay için bekliyor.")
							return "completed"
						}
						await reply(
							message,
							"⚠️ Görev kaydedilirken bir hata oluştu. Tekrar denemek için 'Tamam' yazınız veya işlemi iptal etmek için '!iptal' yazınız.",
						)
						return "handled"
					}

					await reply(message, "Lütfen bir görsel gönderiniz ya da işlem tamamlamak için 'Tamam' yazınız.")
					return "handled"
				}

				default:
					return "handled"
			}
		},
	}
}
