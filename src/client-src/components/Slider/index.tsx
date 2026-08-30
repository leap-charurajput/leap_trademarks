/*
 * Slider — a labelled range input (native input[type=range]) themed for Illustrator. Optionally
 * shows the current value next to the label. onChange returns a number.
 */
import { useId } from 'react'
import { Field } from '../Field'
import '../field-shared.css'
import './style.css'

export interface SliderProps {
	value: number
	onChange: (value: number) => void
	min?: number
	max?: number
	step?: number
	label?: string
	hint?: string
	showValue?: boolean
	fullWidth?: boolean
	disabled?: boolean
	id?: string
	className?: string
}

export function Slider({ value, onChange, min = 0, max = 100, step = 1, label, hint, showValue = true, fullWidth = true, disabled, id, className = '' }: SliderProps) {
	const autoId = useId()
	const inputId = id ?? autoId
	const composedLabel = label != null && showValue ? `${label}: ${value}` : label

	return (
		<Field label={composedLabel} hint={hint} htmlFor={inputId} disabled={disabled} fullWidth={fullWidth} className={className}>
			<input
				id={inputId}
				type="range"
				className="leap-slider"
				value={value}
				min={min}
				max={max}
				step={step}
				disabled={disabled}
				onChange={(e) => onChange(Number(e.target.value))}
			/>
		</Field>
	)
}
