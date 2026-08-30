/*
 * TextArea — a labelled multi-line text input (Adobe/Illustrator themed). Wraps a native <textarea>
 * in the shared Field chrome. onChange returns the string value. `rows` controls the visible height.
 */
import { useId, type TextareaHTMLAttributes } from 'react'
import { Field } from '../Field'
import '../field-shared.css'

export interface TextAreaProps extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'onChange' | 'value'> {
	value: string
	onChange: (value: string) => void
	label?: string
	hint?: string
	error?: string
	required?: boolean
	fullWidth?: boolean
}

export function TextArea({ value, onChange, label, hint, error, required, fullWidth, disabled, rows = 3, id, className = '', ...rest }: TextAreaProps) {
	const autoId = useId()
	const inputId = id ?? autoId
	const inputClass = ['leap-input', error ? 'leap-input--invalid' : '', className].filter(Boolean).join(' ')

	return (
		<Field label={label} hint={hint} error={error} required={required} htmlFor={inputId} disabled={disabled} fullWidth={fullWidth}>
			<textarea
				id={inputId}
				className={inputClass}
				value={value}
				rows={rows}
				disabled={disabled}
				onChange={(e) => onChange(e.target.value)}
				{...rest}
			/>
		</Field>
	)
}
