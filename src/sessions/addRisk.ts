import { Message, MessageMedia } from "whatsapp-web.js"
import { FieldValue } from "firebase-admin/firestore"

import { getDb } from "../firebase/index"
import { uploadImages } from "../firebase/storage"
import { SEVERITY_MAP, TYPE_MAP } from "../constants"

export function createAddRiskSession(): Session {
	let currentStep: RiskStep = "type"
	let draft: RiskDraft = {}

	async function reply(message: Message, content: string): Promise<Message> {
		return message.reply(content)
	}

	async function finalize(message: Message, user: AuthUser): Promise<boolean> {
		const db = getDb()
		const risksCollection = db.collection("risks")

		const payload = {
			type: draft.type,
			category: draft.category,
			location: draft.location,
			description: draft.description || "",
			severity: draft.severity || "low",
			status: "new",
			images: [] as string[],
			createdBy: user.name,
			createdById: user.uid,
			createdAt: FieldValue.serverTimestamp(),
			updatedAt: FieldValue.serverTimestamp(),
		}

		// Risk dokümanı oluşturuldu mu? (başarı ölçütü)
		let created = false

		try {
			const docRef = await risksCollection.add(payload)
			created = true
			await reply(message, `✅ Bildiriminiz alındı! Görseller yükleniyor... Lütfen bekleyiniz.`)

			const collected = draft.images || []
			if (collected.length > 0) {
				const result = await uploadImages(collected, `risks/${docRef.id}`)
				if (result.success) {
					await docRef.update({ images: result.urls || [] })
				} else {
					console.error("uploadImages failed:", result.error)
					await reply(message, "⚠️ Görseller yüklenemedi ancak bildiriminiz kaydedildi.")
				}
			}

			await reply(message, `✅ Bildiriminiz kaydedildi! En kısa sürede incelenecektir.`)
			return true
		} catch (error) {
			console.error("Firestore insert / upload failed:", error)

			// Doküman zaten oluşturulduysa yukarıda kısmen başarılı olmuştur;
			// tekrar denemek çift kayıt oluşturur. Yine de tamamlandı say.
			if (created) {
				await reply(message, "⚠️ Bildiriminiz kaydedildi ancak görseller işlenemedi. Lütfen yöneticinizle iletişime geçin.")
				return true
			}

			await reply(message, "❌ Bildiriminiz kaydedilirken bir hata oluştu. Lütfen tekrar 'Tamam' yazınız.")
			return false
		}
	}

	return {
		start: () => "Bildirim Türü seçiniz:\n\n1. Risk Bildirimi\n2. İş Kazası\n3. Ramak Kala",

		async handle({ message, user }: SessionContext): Promise<SessionOutcome> {
			const text = message.body.trim()

			switch (currentStep) {
				case "type": {
					const type = TYPE_MAP[text]
					if (!type) {
						await reply(message, "Geçersiz seçim. Lütfen 1, 2 veya 3 giriniz:\n1. Risk Bildirimi\n2. İş Kazası\n3. Ramak Kala")
						return "handled"
					}
					draft.type = type
					currentStep = "category"
					await reply(message, "Kategori giriniz (Örn: Elektrik, Makine, Yangın, Zemin)")
					return "handled"
				}

				case "category": {
					draft.category = text
					currentStep = "location"
					await reply(message, "Konum (Örn: A Blok Depo, Üretim Hattı 2)")
					return "handled"
				}

				case "location": {
					draft.location = text
					currentStep = "severity"
					await reply(message, "Durumun şiddetini seçiniz:\n\n1. Düşük\n2. Orta\n3. Yüksek\n4. Kritik")
					return "handled"
				}

				case "severity": {
					const severity = SEVERITY_MAP[text]
					if (!severity) {
						await reply(message, "Geçersiz seçim. Lütfen 1, 2, 3 veya 4 giriniz:\n1. Düşük\n2. Orta\n3. Yüksek\n4. Kritik")
						return "handled"
					}
					draft.severity = severity
					currentStep = "description"
					await reply(message, "Durumu kısaca açıklayınız:")
					return "handled"
				}

				case "description": {
					if (!text) {
						await reply(message, "Açıklama boş olamaz. Lütfen durumu kısaca açıklayınız:")
						return "handled"
					}
					draft.description = text
					currentStep = "images"
					await reply(message, "İlgili görselleri gönderiniz (isteğe bağlı). Gönderim tamamlandıysa 'Tamam' yazınız.")
					return "handled"
				}

				case "images": {
					const collectedImages = draft.images || []

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

						collectedImages.push({ data: media.data, mimetype: media.mimetype })
						draft.images = collectedImages
						await reply(
							message,
							`📷 ${collectedImages.length} görsel alındı.\nBaşka görsel ekleyebilir veya işlem tamamlamak için 'Tamam' yazabilirsiniz.`,
						)
						return "handled"
					}

					if (text.toLowerCase() === "tamam") {
						const success = await finalize(message, user)
						if (success) {
							currentStep = "done"
							return "completed"
						}

						// If the finalize failed, we stay in the "images" step and ask the user to retry or cancel
						await reply(
							message,
							"⚠️ Bildirim kaydedilirken bir hata oluştu. Tekrar denemek için 'Tamam' yazınız veya işlemi iptal etmek için '!iptal' yazınız.",
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
