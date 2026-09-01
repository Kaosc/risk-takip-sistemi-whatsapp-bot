import { Message, MessageMedia } from "whatsapp-web.js"
import { FieldValue, Timestamp } from "firebase-admin/firestore"

import { getDb } from "../firebase/index"

type AssignRiskStep = "selectStaff" | "taskDescription" | "dueDate" | "done"

async function fetchRandomNewRisk(): Promise<(Risk & { id: string }) | null> {
	const db = getDb()
	const snapshot = await db.collection("risks").where("status", "==", "new").limit(10).get()
	if (snapshot.empty) return null
	const docs = snapshot.docs
	const doc = docs[Math.floor(Math.random() * docs.length)]
	return { id: doc.id, ...doc.data() } as Risk & { id: string }
}

async function fetchStaffUsers(): Promise<User[]> {
	const db = getDb()
	const snapshot = await db.collection("users").where("role", "==", "STAFF").get()
	return snapshot.docs.map((doc) => doc.data() as User)
}

function buildRiskDetails(risk: Risk): string {
	const lines = [
		"● Atanacak Risk Detayları:",
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
	return lines.join("\n")
}

function buildStaffList(staff: User[]): string {
	return staff.map((s, i) => `${i + 1} - ${s.name}`).join("\n")
}

/** "Gün-Ay-Yıl" (örn: 10-06-2024) formatını tarihe çevirir; geçersizse null. */
function parseDueDate(text: string): Date | null {
	const match = /^(\d{1,2})-(\d{1,2})-(\d{4})$/.exec(text.trim())
	if (!match) return null
	const day = parseInt(match[1], 10)
	const month = parseInt(match[2], 10)
	const year = parseInt(match[3], 10)
	const date = new Date(year, month - 1, day)
	// 32-13-2024 gibi geçersiz kaymaları reddet
	if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null
	return date
}

/** DD-MM-YYYY ---> "YYYY-MM-DD" */
function formatDate(date: Date): string {
	const day = String(date.getDate()).padStart(2, "0")
	const month = String(date.getMonth() + 1).padStart(2, "0")
	return `${date.getFullYear()}-${month}-${day}`
}

export function createAssignRiskSession(): Session & { active: boolean } {
	let currentStep: AssignRiskStep = "done"
	let aborted = false
	let currentRisk: (Risk & { id: string }) | null = null
	let staffUsers: User[] = []
	let selectedStaff: User | null = null
	let taskDescription = ""

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

	async function assignRisk(dueDate: Date, staff: User): Promise<boolean> {
		if (!currentRisk) return false
		const db = getDb()
		try {
			await db
				.collection("risks")
				.doc(currentRisk.id)
				.update({
					status: "inprogress",
					assignedToId: staff.uid,
					taskDescription,
					dueDate: Timestamp.fromDate(dueDate),
					updatedAt: FieldValue.serverTimestamp(),
				})
			return true
		} catch (error) {
			console.error("Risk atanırken hata oluştu:", error)
			return false
		}
	}

	return {
		get active(): boolean {
			return !aborted
		},

		async start(message: Message): Promise<string> {
			currentRisk = await fetchRandomNewRisk()
			if (!currentRisk) {
				aborted = true
				currentStep = "done"
				return "❌ Atanmayı bekleyen 'yeni' durumunda bir risk yok."
			}

			staffUsers = await fetchStaffUsers()
			if (staffUsers.length === 0) {
				aborted = true
				currentStep = "done"
				return "❌ Sistemde STAFF rolünde bir personel bulunmuyor."
			}

			await showRiskDetails(message, currentRisk)

			currentStep = "selectStaff"
			return `👷 Görev atanacak personeli seçiniz:\n${buildStaffList(staffUsers)}`
		},

		async handle({ message }: SessionContext): Promise<SessionOutcome> {
			if (aborted) {
				await reply(message, "🚫 Bu oturumda işlem yapılamaz. Yeniden başlatmak için 'menu' yazınız.")
				return "completed"
			}

			const text = message.body.trim()

			switch (currentStep) {
				case "selectStaff": {
					const index = parseInt(text, 10) - 1
					const staff = staffUsers[index]
					if (!staff) {
						await reply(message, `❌ Geçersiz seçim. Lütfen personellerden birini seçiniz:\n${buildStaffList(staffUsers)}`)
						return "handled"
					}
					selectedStaff = staff
					currentStep = "taskDescription"
					await reply(message, "📝 Görev tanımını giriniz (yapılması istenen düzeltici faaliyet):")
					return "handled"
				}

				case "taskDescription": {
					if (!text) {
						await reply(message, "❌ Görev tanımı boş olamaz. Lütfen yapılması istenen düzeltici faaliyeti giriniz:")
						return "handled"
					}
					taskDescription = text
					currentStep = "dueDate"
					await reply(message, "📅 Termin (Son işlem tarihi) tarihini giriniz (örn: 10-06-2024 - gün-ay-yıl):")
					return "handled"
				}

				case "dueDate": {
					const dueDate = parseDueDate(text)
					if (!dueDate) {
						await reply(message, "❌ Geçersiz tarih formatı. Lütfen gün-ay-yıl şeklinde giriniz (örn: 10-06-2024):")
						return "handled"
					}

					const staff = selectedStaff
					if (!staff) return "handled"

					const success = await assignRisk(dueDate, staff)
					if (success) {
						currentStep = "done"
						await reply(message, `✅ Risk, ${staff.name} adlı personele atandı.\n📅 Termin tarihi: ${formatDate(dueDate)}`)
						return "completed"
					}

					await reply(
						message,
						"❌ Risk güncellenirken bir hata oluştu. Yeniden denemek için tarihi tekrar giriniz veya '!iptal' yazınız.",
					)
					return "handled"
				}

				default:
					return "handled"
			}
		},
	}
}
