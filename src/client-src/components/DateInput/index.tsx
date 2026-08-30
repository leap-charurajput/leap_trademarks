/*
 * DateInput — a labelled native date/time field. The `mode` prop picks the underlying input type
 * (date | time | datetime-local | month | week). onChange returns the raw string value the native
 * control produces (ISO-ish, e.g. "2026-06-12").
 */
import { useId } from 'react'
import { Field } from '../Field'
import '../field-shared.css'

export type DateInputMode = 'date' | 'time' | 'datetime-local' | 'month' | 'week'

export interface DateInputProps {
	value: string
	onChange: (value: string) => void
	mode?: DateInputMode
	label?: string
	hint?: string
	error?: string
	required?: boolean
	fullWidth?: boolean
	min?: string
	max?: string
	disabled?: boolean
	id?: string
	className?: string
}

export function DateInput({ value, onChange, mode = 'date', label, hint, error, required, fullWidth, min, max, disabled, id, className = '' }: DateInputProps) {
	const autoId = useId()
	const inputId = id ?? autoId

	return (
		<Field label={label} hint={hint} error={error} required={required} htmlFor={inputId} disabled={disabled} fullWidth={fullWidth} className={className}>
			<input
				id={inputId}
				type={mode}
				className={`leap-input ${error ? 'leap-input--invalid' : ''}`}
				value={value}
				min={min}
				max={max}
				disabled={disabled}
				onChange={(e) => onChange(e.target.value)}
			/>
		</Field>
	)
}
