import * as path from "path"
import { initializeApp, cert, App } from "firebase-admin"
import * as fs from "fs"
import * as dotenv from "dotenv"

// Ortam değişkenlerini (.env) bu modül alınmadan önce yükle.
// index.ts'te dotenv.config() import'lardan SONRA çalıştığı için,
// module-level initializeFirebase() çağrısı FIREBASE_STORAGE_BUCKET'i
// henüz göremezdi. Bu yüzden yükleme burada yapılıyor.
dotenv.config()

/**
 * Cloud Storage bucket adını belirler.
 * Öncelik sırası:
 *   1. FIREBASE_STORAGE_BUCKET ortam değişkeni (örn. "myapp.appspot.com")
 *   2. Service account'taki project_id'den türetilen "<project_id>.appspot.com"
 *   3. Hiçbiri yoksa undefined (getStorage() çağrısında explicit bucket verilebilir)
 */
function resolveStorageBucket(serviceAccount: any): string | undefined {
	if (process.env.FIREBASE_STORAGE_BUCKET) {
		return process.env.FIREBASE_STORAGE_BUCKET
	}
	const projectId = serviceAccount?.project_id
	if (projectId) {
		return `${projectId}.appspot.com`
	}
	return undefined
}

export function initializeFirebase(): App {
	// Option A: Local serviceAccountKey.json file
	const serviceAccountPath = path.join(__dirname, "../../serviceAccountKey.json")

	if (fs.existsSync(serviceAccountPath)) {
		let serviceAccount: any = {}
		if (!process.env.FIREBASE_STORAGE_BUCKET) {
			try {
				serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, "utf8"))
			} catch {
				serviceAccount = {}
			}
		}
		const opts: any = { credential: cert(serviceAccountPath) }
		const bucket = resolveStorageBucket(serviceAccount)
		if (bucket) opts.storageBucket = bucket

		return initializeApp(opts)
	}

	// Option B: Environment variable (FIREBASE_SERVICE_ACCOUNT_KEY)
	const envKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY
	if (envKey) {
		const serviceAccount = JSON.parse(envKey)
		const opts: any = { credential: cert(serviceAccount) }
		const bucket = resolveStorageBucket(serviceAccount)
		if (bucket) opts.storageBucket = bucket
		return initializeApp(opts)
	}

	throw new Error("Firebase credentials not found. Provide serviceAccountKey.json or set FIREBASE_SERVICE_ACCOUNT_KEY env var.")
}
