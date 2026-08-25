import { getStorageDb } from ".";

async function getSignedUrl(reference: any): Promise<string> {
	const [url] = await reference.getSignedUrl({
		action: "read",
		expires: "03-09-2491",
	})
	return url
}

export const uploadImages = async (
	images: Array<{ data: string; mimetype?: string }>,
	destinationPath?: string,
): Promise<{ success: boolean; urls?: string[]; error?: string }> => {
	const storage = getStorageDb()

	try {
		if (!images || images.length === 0) {
			return { success: true, urls: [] }
		}

		const folder = destinationPath?.replace(/^\/+|\/+$/g, "") || "uploads"
		const urls: string[] = []

		for (let i = 0; i < images.length; i++) {
			const { data, mimetype } = images[i]
			if (!data) continue

			// mimetype'dan uzantıya çevir (örn. image/png -> png)
			const mime = (mimetype || "image/jpeg").toLowerCase()
			const mimeExt = mime.split("/")[1]?.split("+")[0] || "jpg"
			const extension = ["jpg", "jpeg", "png", "gif", "webp", "bmp", "heic"].includes(mimeExt) ? mimeExt : "jpg"
			const fileName = `${Date.now()}-${i}.${extension}`
			const path = `${folder}/${fileName}`
			const reference = storage.bucket().file(path)

			// whatsapp-web.js media.data, base64 kodlu ham baytlardır; doğrudan yazılır.
			await reference.save(Buffer.from(data, "base64"), {
				contentType: mime,
				metadata: { contentType: mime },
			})
			const url = await getSignedUrl(reference)
			urls.push(url)
		}

		return { success: true, urls }
	} catch (error: any) {
		console.error("uploadImages hatası:", error?.message || error)
		return { success: false, error: error?.message || "Görseller yüklenirken bir hata oluştu." }
	}
}
