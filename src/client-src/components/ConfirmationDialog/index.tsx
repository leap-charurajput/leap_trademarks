/**
 * ConfirmationDialog — themed OK/Cancel (replaces window.confirm in the CEP panel).
 */
import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Button } from '../Button'
import { ButtonVariant } from '../../enums'
import './style.css'

export type ConfirmationDialogMode = 'confirm' | 'alert'

export interface ConfirmationDialogProps {
	open: boolean
	mode?: ConfirmationDialogMode
	title?: string
	message: ReactNode
	confirmText?: string
	cancelText?: string
	confirmVariant?: ButtonVariant.Primary | ButtonVariant.Danger
	onConfirm: () => void
	onCancel: () => void
}

export function ConfirmationDialog({
	open,
	mode = 'confirm',
	title = 'Confirm',
	message,
	confirmText = 'OK',
	cancelText = 'Cancel',
	confirmVariant,
	onConfirm,
	onCancel,
}: ConfirmationDialogProps) {
	const isAlert = mode === 'alert'
	const resolvedVariant =
		confirmVariant ?? (isAlert ? ButtonVariant.Primary : ButtonVariant.Danger)
	const cancelRef = useRef<HTMLButtonElement>(null)
	const okRef = useRef<HTMLButtonElement>(null)

	useEffect(() => {
		if (!open) return
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') (isAlert ? onConfirm : onCancel)()
		}
		document.addEventListener('keydown', onKey)
		const prevOverflow = document.body.style.overflow
		document.body.style.overflow = 'hidden'
		const focusId = window.setTimeout(() => {
			if (isAlert) okRef.current?.focus()
			else cancelRef.current?.focus()
		}, 0)
		return () => {
			document.removeEventListener('keydown', onKey)
			document.body.style.overflow = prevOverflow
			window.clearTimeout(focusId)
		}
	}, [isAlert, open, onCancel, onConfirm])

	if (!open) return null

	return createPortal(
		<div
			className="confirmation-dialog__overlay"
			role="dialog"
			aria-modal="true"
			aria-label={title}
			onMouseDown={isAlert ? onConfirm : onCancel}
		>
			<div className="confirmation-dialog" onMouseDown={(e) => e.stopPropagation()}>
				<header className="confirmation-dialog__header">
					<h3 className="confirmation-dialog__title">{title ?? (isAlert ? 'Alert' : 'Confirm')}</h3>
				</header>
				<div className="confirmation-dialog__body">
					{typeof message === 'string' ? (
						<p className="confirmation-dialog__message">{message}</p>
					) : (
						message
					)}
				</div>
				<footer className="confirmation-dialog__footer">
					{isAlert ? (
						<Button ref={okRef} variant={resolvedVariant} onClick={onConfirm}>
							{confirmText}
						</Button>
					) : (
						<>
							<Button ref={cancelRef} variant={ButtonVariant.Secondary} onClick={onCancel}>
								{cancelText}
							</Button>
							<Button variant={resolvedVariant} onClick={onConfirm}>
								{confirmText}
							</Button>
						</>
					)}
				</footer>
			</div>
		</div>,
		document.body,
	)
}
