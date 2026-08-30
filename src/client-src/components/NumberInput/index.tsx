/*
 * NumberInput — a labelled numeric field with custom up/down stepper buttons (Illustrator's "4 pt"
 * style). The native spinner is hidden; the steppers increment/decrement by `step`, clamping to
 * min/max. onChange returns a number (or null when the field is cleared). Holding within min/max is
 * enforced on both typing and stepping.
 */
import { useId } from 'react'
import { Field } from '../Field'
import '../field-shared.css'
import './style.css'

export interface NumberInputProps {
	value: number | null
	onChange: (value: number | null) => void
	label?: string
	hint?: string
	error?: string
	required?: boolean
	fullWidth?: boolean
	min?: number
	max?: number
	step?: number
	placeholder?: string
	disabled?: boolean
	id?: string
	className?: string
}

export function NumberInput({
	value,
	onChange,
	label,
	hint,
	error,
	required,
	fullWidth,
	min,
	max,
	step = 1,
	placeholder,
	disabled,
	id,
	className = '',
}: NumberInputProps) {
	const autoId = useId()
	const inputId = id ?? autoId

	/* Clamp a number to the configured [min, max] range. */
	const clamp = (n: number): number => {
		let r = n
		if (min != null && r < min) r = min
		if (max != null && r > max) r = max
		return r
	}

	/* Step the current value up or down by `step`, treating an empty field as the min (or 0). */
	const bump = (dir: 1 | -1) => {
		if (disabled) return
		const base = value ?? (min ?? 0)
		onChange(clamp(base + dir * step))
	}

	const fieldClass = ['leap-numberinput', className].filter(Boolean).join(' ')

	return (
		<Field label={label} hint={hint} error={error} required={required} htmlFor={inputId} disabled={disabled} fullWidth={fullWidth} className={fieldClass}>
			<div className="leap-numberinput__control">
				<input
					id={inputId}
					type="number"
					className={`leap-input leap-numberinput__input ${error ? 'leap-input--invalid' : ''}`}
					value={value ?? ''}
					min={min}
					max={max}
					step={step}
					placeholder={placeholder}
					disabled={disabled}
					onChange={(e) => {
						const raw = e.target.value
						if (raw === '') return onChange(null)
						const n = Number(raw)
						if (!Number.isNaN(n)) onChange(clamp(n))
					}}
				/>
				<span className="leap-numberinput__steppers">
					<button type="button" className="leap-numberinput__step leap-numberinput__step--up" tabIndex={-1} disabled={disabled} aria-label="Increment" onClick={() => bump(1)} />
					<button type="button" className="leap-numberinput__step leap-numberinput__step--down" tabIndex={-1} disabled={disabled} aria-label="Decrement" onClick={() => bump(-1)} />
				</span>
			</div>
		</Field>
	)
}
