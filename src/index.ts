import { Client, LocalAuth } from "whatsapp-web.js"
import qrcode from "qrcode-terminal"
import * as fs from "fs"
import * as dotenv from "dotenv"
import { handleMessage } from "./message"

dotenv.config()

function findChromeExecutable(): string | undefined {
	const candidates = [
		process.env.CHROME_PATH,
		"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
		"C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
		"C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
		"C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
	]

	for (const candidate of candidates) {
		if (candidate && fs.existsSync(candidate)) {
			return candidate
		}
	}
	return undefined
}

const chromeExecutable = findChromeExecutable()
if (!chromeExecutable) {
	console.warn("Chrome/Edge executable not found. Install Chrome or set CHROME_PATH env var.")
}

const client = new Client({
	authStrategy: new LocalAuth(),
	puppeteer: {
		headless: true,
		args: ["--no-sandbox", "--disable-setuid-sandbox"],
		...(chromeExecutable ? { executablePath: chromeExecutable } : {}),
	},
})

client.on("qr", (qr) => {
	console.log("Scan the QR code with WhatsApp to authenticate:")
	qrcode.generate(qr, { small: true })
})

client.on("ready", () => {
	console.log("Bot is ready!")
})

client.on("message_create", async (message) => {
	// !! HARD CODE ID OF THE CHAT AND SENDER ID OTHER WISE IT WILL AUTO RESPOND TO ALL AVAILABLE CHATS 
	const isSelfChat = message.from === process.env.MESSAGE_FROM && message.to === process.env.MESSAGE_TO
	if (!message.fromMe || !isSelfChat) return

	try {
		await handleMessage(message)
	} catch (e) {
		console.error("Error handling message:", e)
	}
})

client.on("disconnected", (reason) => {
	console.log("Client disconnected:", reason)
})

client.initialize().catch((error) => {
	console.error("Failed to initialize WhatsApp client:", error)
	process.exit(1)
})
