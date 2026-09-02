export const ACTIONS: Record<RoleAction, ActionDef> = {
	addRisk: { key: "addRisk", label: "Risk Ekle", implemented: true },
	assignRisk: { key: "assignRisk", label: "Risk Atama", implemented: true },
	confirmRisk: { key: "confirmRisk", label: "Risk Onayla", implemented: true },
	completeRisk: { key: "completeRisk", label: "Görev Tamamla", implemented: true },
}

const ROLE_ACTIONS: Record<AuthUser["role"], RoleAction[]> = {
	MEMBER: ["addRisk"],
	STAFF: ["addRisk", "completeRisk"],
	ADMIN: ["addRisk", "assignRisk", "confirmRisk", "completeRisk"],
}

export function allowedActions(role: AuthUser["role"]): ActionDef[] {
	return (ROLE_ACTIONS[role] || []).map((key) => ACTIONS[key]).filter((action): action is ActionDef => action.implemented)
}

export function buildMenu(role: AuthUser["role"]): string {
	const actions = allowedActions(role)
	if (actions.length === 0) {
		return "Şu an için sizin için uygun bir işlem bulunmuyor. Yakında eklenecektir."
	}
	const lines = actions.map((action, i) => `${i + 1} - ${action.label}`)
	return `İşlem seçiniz:\n\n${lines.join("\n")}`
}

export function matchSelection(role: AuthUser["role"], text: string): RoleAction | undefined {
	const actions = allowedActions(role)
	const index = parseInt(text, 10) - 1
	if (Number.isNaN(index) || index < 0 || index >= actions.length) return undefined
	return actions[index].key
}
