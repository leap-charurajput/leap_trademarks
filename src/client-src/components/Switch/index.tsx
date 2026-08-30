/*
 * Switch — an on/off toggle backed by a hidden native checkbox (so it stays keyboard- and
 * form-accessible). Themed track + thumb; the track fills with the accent colour when on. onChange
 * returns the boolean checked state. The label sits to the right of the switch.
 */
import { useId } from 'react'
import './style.css'

export interface SwitchProps {
	checked: boolean
	onChange: (checked: boolean) => void
	label?: string
	disabled?: boolean
	id?: string
	className?: string
}

export function Switch({ checked, onChange, label, disabled, id, className = '' }: SwitchProps) {
	const autoId = useId()
	const inputId = id ?? autoId
	const classes = ['leap-switch', disabled ? 'is-disabled' : '', className].filter(Boolean).join(' ')

	return (
		<label className={classes} htmlFor={inputId}>
			<input
				id={inputId}
				type="checkbox"
				className="leap-switch__input"
				checked={checked}
				disabled={disabled}
				onChange={(e) => onChange(e.target.checked)}
			/>
			<span className="leap-switch__track" aria-hidden="true">
				<span className="leap-switch__thumb" />
			</span>
			{label != null && <span className="leap-switch__label">{label}</span>}
		</label>
	)
}
