/*
 * PasswordField — a labelled password input with a show/hide toggle. Wraps a native input whose type
 * flips between "password" and "text". onChange returns the string value.
 */
import { useId, useState } from 'react'
import { Field } from '../Field'
import '../field-shared.css'
import './style.css'

export interface PasswordFieldProps {
	value: string
	onChange: (value: string) => void
	label?: string
	hint?: string
	error?: string
	required?: boolean
	fullWidth?: boolean
	placeholder?: string
	disabled?: boolean
	id?: string
	className?: string
}

export function PasswordField({ value, onChange, label, hint, error, required, fullWidth, placeholder, disabled, id, className = '' }: PasswordFieldProps) {
	const autoId = useId()
	const inputId = id ?? autoId
	const [visible, setVisible] = useState(false)

	return (
		<Field label={label} hint={hint} error={error} required={required} htmlFor={inputId} disabled={disabled} fullWidth={fullWidth} className={className}>
			<div className="leap-password__control">
				<input
					id={inputId}
					type={visible ? 'text' : 'password'}
					className={`leap-input leap-password__input ${error ? 'leap-input--invalid' : ''}`}
					value={value}
					placeholder={placeholder}
					disabled={disabled}
					onChange={(e) => onChange(e.target.value)}
				/>
				<button
					type="button"
					className="leap-password__toggle"
					tabIndex={-1}
					disabled={disabled}
					aria-label={visible ? 'Hide password' : 'Show password'}
					onClick={() => setVisible((v) => !v)}
				>
					<span className={`exp-icon exp-icon--sm ${visible ? 'exp-icon--eye-off' : 'exp-icon--eye'}`} aria-hidden="true" />
				</button>
			</div>
		</Field>
	)
}
