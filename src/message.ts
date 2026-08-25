import { Message } from "whatsapp-web.js"

import { buildMenu, matchSelection } from "./services/roles"
import { AddRiskSession } from "./sessions/addRisk"

import { getUserByPhone } from "./firebase/users"
import { getApp } from "./firebase/index"

getApp()

const activeSessions = new Map<string, Session>()

// Normalizing the message.id._serialized field for whatsapp-web.js v1.0.0+
// Since its broken on the latest release
function normalizeMessageId(message: Message): void {
	const id = (message as any).id
	if (id && id._serialized == null && id.$1 != null) {
		id._serialized = id.$1
	}
}

function extractPhone(message: Message): string {
	// 905551234567@c.us
	return message.from.split("@")[0]
}

function isCancelCommand(text: string): boolean {
	return text.toLowerCase() === "!iptal"
}

function isMenuCommand(text: string): boolean {
	const normalized = text.toLowerCase()
	return normalized === "menu" || normalized === "menü"
}

function clearActiveSession(phone: string): void {
	activeSessions.delete(phone)
}

// Main message route
export async function handleMessage(message: Message): Promise<void> {
	normalizeMessageId(message)

	const phone = extractPhone(message)
	const text = message.body.trim()
	if (!text) return

	// Cancel command: "!iptal"
	if (isCancelCommand(text)) {
		if (activeSessions.has(phone)) {
			clearActiveSession(phone)
			await message.reply("❌ İşlem iptal edildi.")
		} else {
			await message.reply("Aktif bir işleminiz bulunmuyor.")
		}
		return
	}

	const user = await getUserByPhone(phone)
	if (!user) {
		await message.reply("⚠️ Sistemde kayıtlı bir kullanıcı olarak bulunamadınız. Lütfen yöneticinizle iletişime geçin.")
		return
	}

	// If there is an active session for this user, delegate the message to it
	const active = activeSessions.get(phone)
	if (active) {
		const outcome = await active.handle({ message, user })
		if (outcome !== ("handled" as SessionOutcome)) {
			clearActiveSession(phone)
		}
		return
	}

	// Menu command: "menu" or "menü"
	if (isMenuCommand(text)) {
		await message.reply(buildMenu(user.role))
		return
	}

	// Menu selection (by number)
	const action = matchSelection(user.role, text)
	if (action) {
		await startAction(action, phone, message, user)
		return
	}

	// If none of the above, show the menu again
	await message.reply(buildMenu(user.role))
}

/** Seçilen eyleme göre ilgili oturumu başlatır. */
async function startAction(
	action: RoleAction,
	phone: string,
	message: Message,
	user: AuthUser,
): Promise<void> {
	switch (action) {
		case "addRisk": {
			const session = new AddRiskSession()
			activeSessions.set(phone, session)
			await message.reply(session.starter())
			return
		}

		// Other action will be added later on in this block
		default:
			await message.reply(buildMenu(user.role))
			return
	}
}

