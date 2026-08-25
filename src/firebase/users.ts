import { getDb } from "../firebase/index"

export function normalizePhone(raw: string): string {
	return raw.replace(/\D/g, "")
}

export async function getUserByPhone(phone: string): Promise<AuthUser | null> {
	const digits = normalizePhone(phone)
	if (!digits) return null

	const db = getDb()
	const snapshot = await db.collection("users").where("phoneNumber", "==", digits).limit(1).get()

	if (snapshot.empty) return null

	const doc = snapshot.docs[0]
	const data = doc.data() as User

	return data
}
