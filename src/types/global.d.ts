/**
 * Ambient declarations for the CEP runtime globals injected by CSInterface.js / Illustrator.
 * Kept intentionally small — anything that touches these must live in `src/lib/`.
 */
export {}

declare global {
	interface Window {
		__adobe_cep__?: unknown
		CSInterface?: new () => unknown
		cep?: {
			fs?: Record<string, (...args: unknown[]) => { err: number; data?: string }>
			util?: { openURLInDefaultBrowser?: (url: string) => void }
		}
		cep_node?: {
			require?: (id: string) => unknown
		}
	}
}
