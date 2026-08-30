/**
 * Modal — reusable dialog used by every settings panel that the legacy plugin opened as a
 * CEP ModalDialog extension. Rendered in a portal; closes on overlay click and Escape.
 */
import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { IconButton } from '../IconButton'
import './style.css'

export interface ModalProps {
	open: boolean
	title?: string
	onClose: () => void
	children: ReactNode
	footer?: ReactNode
	/** Fixed content width in px (legacy modals had fixed widths). */
	width?: number
	closeOnOverlay?: boolean
}

export function Modal({ open, title, onClose, children, footer, width = 360, closeOnOverlay = false }: ModalProps) {
	useEffect(() => {
		if (!open) return
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') onClose()
		}
		document.addEventListener('keydown', onKey)
		return () => document.removeEventListener('keydown', onKey)
	}, [open, onClose])

	if (!open) return null

	return createPortal(
		<div className="leap-modal__overlay" onMouseDown={closeOnOverlay ? onClose : undefined}>
			<div
				className="leap-modal"
				style={{ width }}
				role="dialog"
				aria-modal="true"
				aria-label={title}
				onMouseDown={(e) => e.stopPropagation()}
			>
				{title != null && (
					<header className="leap-modal__header">
						<h2 className="leap-modal__title">{title}</h2>
						<IconButton label="Close" onClick={onClose}>
							<svg viewBox="0 0 16 16">
								<path
									d="M3 3l10 10M13 3L3 13"
									stroke="currentColor"
									strokeWidth="1.5"
									strokeLinecap="round"
									fill="none"
								/>
							</svg>
						</IconButton>
					</header>
				)}
				<div className="leap-modal__body leap-scroll">{children}</div>
				{footer != null && <footer className="leap-modal__footer">{footer}</footer>}
			</div>
		</div>,
		document.body,
	)
}
