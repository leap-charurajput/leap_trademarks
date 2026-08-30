/**
 * Checkbox — labelled boolean control with SVG icons (matches leap_color_separator).
 */
import { useEffect, useId, useMemo, useRef, type InputHTMLAttributes } from 'react'
import { CheckedIcon, IndeterminateIcon, UncheckedIcon } from './checkboxIcons'
import './style.css'

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'onChange'> {
	label?: string
	checked: boolean
	indeterminate?: boolean
	onChange: (checked: boolean) => void
}

export function Checkbox({
	label,
	checked,
	indeterminate = false,
	onChange,
	className = '',
	disabled,
	id,
	...rest
}: CheckboxProps) {
	const autoId = useId()
	const inputId = id ?? autoId
	const inputRef = useRef<HTMLInputElement>(null)

	useEffect(() => {
		if (inputRef.current) {
			inputRef.current.indeterminate = indeterminate
		}
	}, [indeterminate])

	const icon = useMemo(() => {
		if (indeterminate) return <IndeterminateIcon />
		return checked ? <CheckedIcon /> : <UncheckedIcon />
	}, [checked, indeterminate])

	return (
		<label
			className={['checkbox-component', disabled ? 'disabled' : '', className].filter(Boolean).join(' ')}
			htmlFor={inputId}
		>
			<input
				{...rest}
				ref={inputRef}
				id={inputId}
				type="checkbox"
				className="checkbox-input"
				checked={checked && !indeterminate}
				disabled={disabled}
				onChange={(e) => {
					if (disabled) return
					onChange(e.target.checked)
				}}
			/>
			<span className="checkbox-icon" aria-hidden="true">
				{icon}
			</span>
			{label != null && <span className="checkbox-label-text">{label}</span>}
		</label>
	)
}
