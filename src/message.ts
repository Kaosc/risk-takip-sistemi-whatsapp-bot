import { Message } from "whatsapp-web.js"

import { getFirestore, FieldValue } from "firebase-admin/firestore"
import { initializeFirebase } from "./firebase/firebase"

const firebaseApp = initializeFirebase()

const db = getFirestore(firebaseApp)

const risksCollection = db.collection("risks")

const sessions = new Map<string, Session>()

function getsenderPhone(message: Message): string {
	// whatsapp-web.js: message.from is the chat id (e.g. "905551234567@c.us")
	// We strip the "@c.us" suffix to get the raw phone number.
	return message.from.split("@")[0]
}

function clearSession(senderPhone: string): void {
	sessions.delete(senderPhone)
}

function isCancelCommand(text: string): boolean {
	const normalized = text.trim().toLowerCase()
	return normalized === "!iptal"
}

function isStartCommand(text: string): boolean {
	const normalized = text.trim().toLowerCase()
	return normalized === "risk" || normalized === "menu"
}

export async function handleMessage(message: Message): Promise<void> {
	const senderPhone = getsenderPhone(message)
	const text = message.body.trim()

	// --- Cancel command at any step ---
	if (isCancelCommand(text)) {
		if (sessions.has(senderPhone)) {
			clearSession(senderPhone)
			await message.reply("❌ Bildirim işlemi iptal edildi.")
		} else {
			await message.reply("Aktif bir bildirim işleminiz bulunmuyor.")
		}
		return
	}

	// --- Start command ---
	if (isStartCommand(text)) {
		sessions.set(senderPhone, { step: "type", data: {} })
		await message.reply("Bildirim Türü Seçiniz:\n\n1. Risk Bildirimi\n2. İş Kazası\n3. Ramak Kala")
		return
	}

	// --- If no active session, ignore ---
	const session = sessions.get(senderPhone)
	if (!session) {
		return
	}

	// --- Process based on current step ---
	switch (session.step) {
		case "type": {
			const typeMap: Record<string, string> = {
				"1": "risk",
				"2": "accident",
				"3": "nearmiss",
			}
			const type = typeMap[text]
			if (!type) {
				await message.reply("Geçersiz seçim. Lütfen 1, 2 veya 3 giriniz:\n1. Risk Bildirimi\n2. İş Kazası\n3. Ramak Kala")
				return
			}
			session.data.type = type
			session.step = "category"
			await message.reply("Kategori giriniz (Örn: Elektrik, Makine, Yangın, Zemin)")
			return
		}

		case "category": {
			session.data.category = text
			session.step = "location"
			await message.reply("Konum giriniz (Örn: A Blok Depo, Üretim Hattı 2)")
			return
		}

		case "location": {
			session.data.location = text
			session.step = "description"
			await message.reply("Durumu kısaca açıklayınız:")
			return
		}

		case "description": {
			// Build the risk payload
			const payload = {
				type: session.data.type,
				category: session.data.category,
				location: session.data.location,
				description: text,
				severity: "medium",
				status: "new",
				createdBy: "whatsapp_bot",
				createdAt: FieldValue.serverTimestamp(),
			}

			try {
				// Insert into Firestore "risks" collection
				const docRef = await risksCollection.add(payload)
				await message.reply(`✅ Bildiriminiz alindi! Takip No: ${docRef.id}. En kısa sürede incelenecektir.`)
			} catch (error) {
				console.error("Firestore insert failed:", error)
				await message.reply("❌ Bildiriminiz kaydedilirken bir hata oluştu. Lütfen daha sonra tekrar deneyiniz.")
			}

			// Clear the user's session state
			clearSession(senderPhone)
			return
		}
	}
}
