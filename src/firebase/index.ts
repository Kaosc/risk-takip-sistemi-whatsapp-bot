import { App } from "firebase-admin"
import { Firestore, getFirestore } from "firebase-admin/firestore"
import { getStorage, Storage } from "firebase-admin/storage"
import { initializeFirebase } from "./firebase"

let _app: App | undefined
let _db: Firestore | undefined
let _storage: Storage | undefined

/**
 * Firebase Admin App'ini tek örnek (singleton) olarak döndürür.
 * initializeApp() yalnızca bir kez çağrılmalıdır; birden çok çağrı
 * "duplicate app" hatası fırlatabilir. Bu yüzden tüm modüller bu yolu kullanır.
 */
export function getApp(): App {
	if (!_app) {
		_app = initializeFirebase()
	}
	return _app
}

/** Aynı App üzerinden Firestore db'sini tek örnek halinde döndürür. */
export function getDb(): Firestore {
	if (!_db) {
		_db = getFirestore(getApp())
	}
	return _db
}

export function getStorageDb(): Storage {
	if (!_storage) {
		_storage = getStorage(getApp())
	}
	return _storage
}
