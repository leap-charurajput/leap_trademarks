/*
 * Field — the shared label/hint/error wrapper every native form control composes (and which can be
 * used standalone around any control). Keeps form rows visually consistent across Adobe plugins.
 * Renders, in order: optional label (bound to the control via htmlFor), the control (children), then
 * an error message (if any) or a hint.
 */
import type { ReactNode } from 'react'
import '../field-shared.css'

export interface FieldProps {
	label?: string
	hint?: string
	error?: string
	required?: boolean
	htmlFor?: string
	disabled?: boolean
	fullWidth?: boolean
	className?: string
	children: ReactNode
}

export function Field({ label, hint, error, required, htmlFor, disabled, fullWidth, className = '', children }: FieldProps) {
	const classes = ['leap-field', fullWidth ? 'leap-field--full' : '', disabled ? 'is-disabled' : '', className]
		.filter(Boolean)
		.join(' ')

	return (
		<div className={classes}>
			{label != null && (
				<label className={`leap-field__label ${required ? 'leap-field__label--required' : ''}`} htmlFor={htmlFor}>
					{label}
				</label>
			)}
			{children}
			{error ? (
				<span className="leap-field__error" role="alert">
					{error}
				</span>
			) : (
				hint && <span className="leap-field__hint">{hint}</span>
			)}
		</div>
	)
}
