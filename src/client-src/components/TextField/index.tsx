/*
 * TextField — a labelled single-line text input (Adobe/Illustrator themed). Wraps a native
 * <input type="text"> in the shared Field chrome (label / hint / error). onChange returns the string
 * value directly. Any extra native input attributes pass through.
 */
import { useId, type InputHTMLAttributes } from 'react'
import { Field } from '../Field'
import '../field-shared.css'

export interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'size' | 'type' | 'value'> {
	value: string
	onChange: (value: string) => void
	label?: string
	hint?: string
	error?: string
	required?: boolean
	fullWidth?: boolean
}

export function TextField({ value, onChange, label, hint, error, required, fullWidth, disabled, id, className = '', ...rest }: TextFieldProps) {
	const autoId = useId()
	const inputId = id ?? autoId
	const inputClass = ['leap-input', error ? 'leap-input--invalid' : '', className].filter(Boolean).join(' ')

	return (
		<Field label={label} hint={hint} error={error} required={required} htmlFor={inputId} disabled={disabled} fullWidth={fullWidth}>
			<input
				id={inputId}
				type="text"
				className={inputClass}
				value={value}
				disabled={disabled}
				onChange={(e) => onChange(e.target.value)}
				{...rest}
			/>
		</Field>
	)
}
