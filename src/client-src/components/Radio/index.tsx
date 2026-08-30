/**
 * RadioGroup — single-select options with color-separator styling. An option may carry a `trailing`
 * node (e.g. a dropdown) rendered inline on the same row as its label.
 */
import { useId, type ReactNode } from 'react'
import './style.css'

export interface RadioOption<T extends string> {
	value: T
	label: string
	disabled?: boolean
	/* Inline content rendered after the label on this row (e.g. a league <Dropdown>). */
	trailing?: ReactNode
}

export interface RadioGroupProps<T extends string> {
	name?: string
	value: T
	options: ReadonlyArray<RadioOption<T>>
	onChange: (value: T) => void
	inline?: boolean
	className?: string
}

export function RadioGroup<T extends string>({
	name,
	value,
	options,
	onChange,
	inline = false,
	className = '',
}: RadioGroupProps<T>) {
	const autoName = useId()
	const groupName = name ?? autoName

	return (
		<div
			className={['radio-group', inline ? 'radio-group--inline' : '', className].filter(Boolean).join(' ')}
			role="radiogroup"
		>
			{options.map((opt) => (
				<div key={opt.value} className="radio-row">
					<label className={['radio-component', opt.disabled ? 'disabled' : ''].filter(Boolean).join(' ')}>
						<input
							type="radio"
							className="radio-input"
							name={groupName}
							value={opt.value}
							checked={value === opt.value}
							disabled={opt.disabled}
							onChange={() => onChange(opt.value)}
						/>
						<span className="radio-icon" aria-hidden="true" />
						<span className="radio-label-text">{opt.label}</span>
					</label>
					{opt.trailing != null && <span className="radio-row__trailing">{opt.trailing}</span>}
				</div>
			))}
		</div>
	)
}
