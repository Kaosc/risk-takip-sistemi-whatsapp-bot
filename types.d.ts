interface User {
	uid: string
	email: string
	role: "ADMIN" | "STAFF" | "MEMBER"
	phoneNumber?: string | undefined
	name: string
	fcmToken?: string | undefined
	createdAt: Date // FirebaseTimestamp
	updatedAt: Date // FirebaseTimestamp
}

interface Risk {
	id: string // Firebase Document ID
	reportNumber?: string // İsteğe bağlı (Örn: 2026-0154)

	// --- 1. REPORTING STAGE (Çalışan Doldurur) ---
	type: "risk" | "accident" | "nearmiss"
	category: string // "Machinery", "Electrical", "Fire" vb.
	location: string // "Production Line 2", "Warehouse" vb.
	description: string
	severity: "low" | "medium" | "high" | "critical"
	images: string[]
	createdBy: string
	createdAt: Date // FirebaseTimestamp
	updatedAt: Date // FirebaseTimestamp
	status: "new" | "inprogress" | "pending" | "completed"
	createdById: string // Riski oluşturan kullanıcının UID'si

	// --- EXTRA FIELDS FOR ACCIDENT (Sadece "type === 'Accident'" ise) ---
	accidentDetails?: {
		involvedPersons: string[] // Kazaya karışan kişiler
		injuryStatus: string // "Minor scratch", "Fracture" vb.
		firstAidProvided: boolean // İlk müdahale yapıldı mı?
	}

	// --- 2. ASSESSMENT & ASSIGNMENT STAGE (İSG Uzmanı Doldurur) ---
	assignedToId?: string // Görev atanan personelin UID'si
	taskDescription?: string // Yapılması istenen düzeltici faaliyet
	dueDate?: Date // FirebaseTimestamp // Termin tarihi

	// --- 3. ACTION / RESOLUTION STAGE (Bakım Personeli Doldurur) ---
	afterImages?: string[] // İşlem bittikten sonra çekilen "Sonra" fotoğrafları
	completedAt?: Date // FirebaseTimestamp // Görevin tamamlandığı tarih
	completionNotes?: string // Yapılan işlemlerle ilgili notlar
}

declare module "qrcode-terminal" {
  interface GenerateOptions {
    small?: boolean;
  }
  function generate(text: string, options?: GenerateOptions): void;
  export { generate };
}

type SessionStep = "type" | "category" | "location" | "description"

interface Session {
	step: SessionStep
	data: {
		type?: string
		category?: string
		location?: string
	}
}