/*
 * ColorInput — a labelled colour picker: a native input[type=color] rendered as a square swatch
 * next to a hex text field, kept in sync. onChange returns the hex string (e.g. "#1a2b3c").
 */
import { useId } from 'react'
import { Field } from '../Field'
import '../field-shared.css'
import './style.css'

export interface ColorInputProps {
	value: string
	onChange: (value: string) => void
	label?: string
	hint?: string
	error?: string
	fullWidth?: boolean
	disabled?: boolean
	id?: string
	className?: string
}

export function ColorInput({ value, onChange, label, hint, error, fullWidth, disabled, id, className = '' }: ColorInputProps) {
	const autoId = useId()
	const inputId = id ?? autoId

	return (
		<Field label={label} hint={hint} error={error} htmlFor={inputId} disabled={disabled} fullWidth={fullWidth} className={className}>
			<div className="leap-colorinput__control">
				<input
					id={inputId}
					type="color"
					className="leap-colorinput__swatch"
					value={value}
					disabled={disabled}
					onChange={(e) => onChange(e.target.value)}
				/>
				<input
					type="text"
					className="leap-input leap-colorinput__hex"
					value={value}
					disabled={disabled}
					spellCheck={false}
					onChange={(e) => onChange(e.target.value)}
				/>
			</div>
		</Field>
	)
}
