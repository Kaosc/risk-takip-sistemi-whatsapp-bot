import * as path from "path"
import { initializeApp, cert, App } from "firebase-admin"
import * as fs from "fs"

export function initializeFirebase(): App {
	// Option A: Local serviceAccountKey.json file
	const serviceAccountPath = path.join(__dirname, "..", "serviceAccountKey.json")

	if (fs.existsSync(serviceAccountPath)) {
		return initializeApp({
			credential: cert(serviceAccountPath),
		})
	}

	// Option B: Environment variable (FIREBASE_SERVICE_ACCOUNT_KEY)
	const envKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY
	if (envKey) {
		return initializeApp({
			credential: cert(JSON.parse(envKey)),
		})
	}

	throw new Error("Firebase credentials not found. Provide serviceAccountKey.json or set FIREBASE_SERVICE_ACCOUNT_KEY env var.")
}
