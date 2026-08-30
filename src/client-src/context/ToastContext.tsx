/**
 * ToastProvider — app-wide, non-blocking notifications. Replaces legacy alert()/jQuery
 * popups. UI calls `useToast().notify(...)`; host-side alerts go through a host script.
 */
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react'
import { ToastType } from '../enums'
import { Toast, type ToastItem } from '../components/Toast'

interface ToastContextValue {
	notify: (message: string, type?: ToastType, durationMs?: number) => void
	dismiss: (id: number) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)
const DEFAULT_DURATION = 4000

export function ToastProvider({ children }: { children: ReactNode }) {
	const [toasts, setToasts] = useState<ToastItem[]>([])
	const nextId = useRef(1)

	const dismiss = useCallback((id: number) => {
		setToasts((prev) => prev.filter((t) => t.id !== id))
	}, [])

	const notify = useCallback(
		(message: string, type: ToastType = ToastType.Info, durationMs = DEFAULT_DURATION) => {
			const id = nextId.current++
			setToasts((prev) => [...prev, { id, message, type }])
			if (durationMs > 0) window.setTimeout(() => dismiss(id), durationMs)
		},
		[dismiss],
	)

	const value = useMemo(() => ({ notify, dismiss }), [notify, dismiss])

	return (
		<ToastContext.Provider value={value}>
			{children}
			<Toast toasts={toasts} onDismiss={dismiss} />
		</ToastContext.Provider>
	)
}

export function useToast(): ToastContextValue {
	const ctx = useContext(ToastContext)
	if (!ctx) throw new Error('useToast must be used within a ToastProvider')
	return ctx
}
