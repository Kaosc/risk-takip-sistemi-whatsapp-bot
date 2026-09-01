import { Message } from "whatsapp-web.js"

import { buildMenu, matchSelection } from "./services/roles"
import { createAddRiskSession } from "./sessions/addRisk"
import { createAssignRiskSession } from "./sessions/assignRisk"
import { createConfirmRiskSession } from "./sessions/confirmRisk"
import { createCompleteRiskSession } from "./sessions/completeRisk"

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
	return normalized === "menu" || normalized === "menü" || normalized === "risk"
}

function clearActiveSession(phone: string): void {
	activeSessions.delete(phone)
}

// Main message route
export async function handleMessage(message: Message): Promise<void> {
	normalizeMessageId(message)

	const phone = extractPhone(message)
	const text = message.body.trim()

	// When user sends an empty message (e.g., just media), we ignore it
	// Like if the user sends only an image without any caption, we don't want to process it as a command
	if (!text && !message.hasMedia) return

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

		// Session completed or cancelled, remove it from active sessions
		if (outcome !== "handled") {
			clearActiveSession(phone)
		}

		return
	}

	// Menu command: "menu" | "menü" | "risk"
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
	// await message.reply(buildMenu(user.role))
	return
}

async function startAction(action: RoleAction, phone: string, message: Message, user: AuthUser): Promise<void> {
	switch (action) {
		case "addRisk": {
			const session = createAddRiskSession()
			activeSessions.set(phone, session)
			await message.reply(await session.start(message))
			return
		}

		case "assignRisk": {
			const session = createAssignRiskSession()
			activeSessions.set(phone, session)
			await message.reply(await session.start(message))
			return
		}

		case "confirmRisk": {
			const session = createConfirmRiskSession()
			activeSessions.set(phone, session)
			await message.reply(await session.start(message))
			return
		}

		case "completeRisk": {
			const session = createCompleteRiskSession()
			activeSessions.set(phone, session)
			await message.reply(await session.start(message))
			return
		}
		default:
			await message.reply(buildMenu(user.role))
			return
	}
}
