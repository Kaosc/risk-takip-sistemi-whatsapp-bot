export function parseDueDate(text: string): Date | null {
   const match = /^(\d{1,2})-(\d{1,2})-(\d{4})$/.exec(text.trim())
   if (!match) return null
   const day = parseInt(match[1], 10)
   const month = parseInt(match[2], 10)
   const year = parseInt(match[3], 10)
   const date = new Date(year, month - 1, day)
   if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null
   return date
}

export function formatDate(value?: Date | { toDate(): Date } | null): string {
	if (!value) return "—"
	const date = "toDate" in value ? value.toDate() : new Date(value)
	if (Number.isNaN(date.getTime())) return "—"
	const day = String(date.getDate()).padStart(2, "0")
	const month = String(date.getMonth() + 1).padStart(2, "0")
	return `${date.getFullYear()}-${month}-${day}`
}