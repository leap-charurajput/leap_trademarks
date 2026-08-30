/**
 * Toast — presentational stack of notifications. State is owned by ToastProvider; this
 * component just renders the list in a portal.
 */
import { createPortal } from 'react-dom'
import { ToastType } from '../../enums'
import './style.css'

export interface ToastItem {
	id: number
	message: string
	type: ToastType
}

export interface ToastProps {
	toasts: ToastItem[]
	onDismiss: (id: number) => void
}

export function Toast({ toasts, onDismiss }: ToastProps) {
	if (!toasts.length) return null

	return createPortal(
		<div className="leap-toast-stack">
			{toasts.map((t) => (
				<button key={t.id} type="button" className={`leap-toast leap-toast--${t.type}`} onClick={() => onDismiss(t.id)}>
					{t.message}
				</button>
			))}
		</div>,
		document.body,
	)
}
