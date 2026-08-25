import { Message, MessageMedia } from "whatsapp-web.js"
import { FieldValue } from "firebase-admin/firestore"

import { getDb } from "../firebase/index"
import { uploadImages } from "../firebase/storage"
import { SEVERITY_MAP, TYPE_MAP } from "../constants"

export class AddRiskSession implements Session {
	readonly kind = "addRisk"

	private step: RiskStep = "type"
	private data: RiskDraft = {}

	starter(): string {
		return "Bildirim Türü seçiniz:\n\n1. Risk Bildirimi\n2. İş Kazası\n3. Ramak Kala"
	}

	async handle({ message, user }: SessionContext): Promise<SessionOutcome> {
		const text = message.body.trim()

		switch (this.step) {
			case "type": {
				const type = TYPE_MAP[text]
				if (!type) {
					await this.reply(message, "Geçersiz seçim. Lütfen 1, 2 veya 3 giriniz:\n1. Risk Bildirimi\n2. İş Kazası\n3. Ramak Kala")
					return "handled"
				}
				this.data.type = type
				this.step = "category"
				await this.reply(message, "Kategori giriniz (Örn: Elektrik, Makine, Yangın, Zemin)")
				return "handled"
			}

			case "category": {
				this.data.category = text
				this.step = "location"
				await this.reply(message, "Konum giriniz (Örn: A Blok Depo, Üretim Hattı 2)")
				return "handled"
			}

			case "location": {
				this.data.location = text
				this.step = "severity"
				await this.reply(message, "Durumun şiddetini seçiniz:\n\n1. Düşük\n2. Orta\n3. Yüksek\n4. Kritik")
				return "handled"
			}

			case "severity": {
				const severity = SEVERITY_MAP[text]
				if (!severity) {
					await this.reply(message, "Geçersiz seçim. Lütfen 1, 2, 3 veya 4 giriniz:\n1. Düşük\n2. Orta\n3. Yüksek\n4. Kritik")
					return "handled"
				}
				this.data.severity = severity
				this.step = "description"
				await this.reply(message, "Durumu kısaca açıklayınız:")
				return "handled"
			}

			case "description": {
				if (!text) {
					await this.reply(message, "Açıklama boş olamaz. Lütfen durumu kısaca açıklayınız:")
					return "handled"
				}
				this.data.description = text
				this.step = "images"
				await this.reply(message, "İlgili görselleri gönderiniz (isteğe bağlı). Gönderim tamamlandıysa 'Tamam' yazınız.")
				return "handled"
			}

			case "images": {
				const collected = this.data.images || []

				// Kullanıcı görsel gönderiyor → oturuma ekle, beklemeye devam et.
				if (message.hasMedia) {
					let media: MessageMedia | undefined
					try {
						media = await message.downloadMedia()
					} catch (error) {
						console.error("Görsel indirilirken hata:", error)
						await this.reply(message, "❌ Görsel indirilirken bir hata oluştu. Lütfen görseli tekrar gönderiniz.")
						return "handled"
					}
					if (!media || !media.mimetype.startsWith("image/")) {
						await this.reply(message, "❌ Görsel indirilemedi. Lütfen görseli tekrar gönderiniz.")
						return "handled"
					}
					collected.push({ data: media.data, mimetype: media.mimetype })
					this.data.images = collected
					await this.reply(
						message,
						`📷 ${collected.length} görsel alındı.\nBaşka görsel ekleyebilir veya işlem tamamlamak için 'Tamam' yazabilirsiniz.`,
					)
					return "handled"
				}

				// Kullanıcı işlemi tamamlıyor → dokümanı oluştur, görselleri yükle, URL'leri yaz.
				if (text.toLowerCase() === "tamam") {
					await this.finalize(message, user)
					this.step = "done"
					return "completed"
				}

				await this.reply(message, "Lütfen bir görsel gönderiniz ya da işlem tamamlamak için 'Tamam' yazınız.")
				return "handled"
			}

			default:
				return "handled"
		}
	}

	/** Risk dokümanını oluşturur, görselleri yükler ve URL'leri geri yazar. */
	private async finalize(message: Message, user: AuthUser): Promise<void> {
		const db = getDb()
		const risksCollection = db.collection("risks")

		// --- 1. REPORTING STAGE alanları ---
		const payload = {
			type: this.data.type,
			category: this.data.category,
			location: this.data.location,
			description: this.data.description || "",
			severity: this.data.severity || "low",
			status: "new",
			images: [] as string[],
			createdBy: user.name,
			createdById: user.uid,
			createdAt: FieldValue.serverTimestamp(),
			updatedAt: FieldValue.serverTimestamp(),
		}

		try {
			const docRef = await risksCollection.add(payload)
			await this.reply(message, `✅ Bildiriminiz alındı! Takip No: ${docRef.id}. Görseller yükleniyor...`)

			const collected = this.data.images || []
			if (collected.length > 0) {
				const result = await uploadImages(collected, `risks/${docRef.id}`)
				if (result.success) {
					await docRef.update({ images: result.urls || [] })
				} else {
					console.error("uploadImages failed:", result.error)
					await this.reply(message, "⚠️ Görseller yüklenemedi ancak bildiriminiz kaydedildi.")
				}
			}

			await this.reply(message, `🎉 Bildiriminiz kaydedildi! Takip No: ${docRef.id}. En kısa sürede incelenecektir.`)
		} catch (error) {
			console.error("Firestore insert / upload failed:", error)
			await this.reply(message, "❌ Bildiriminiz kaydedilirken bir hata oluştu. Lütfen daha sonra tekrar deneyiniz.")
		}
	}

	private reply(message: Message, content: string): Promise<Message> {
		return message.reply(content)
	}
}
