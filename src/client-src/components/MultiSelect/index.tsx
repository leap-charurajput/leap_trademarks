/*
 * MultiSelect — a custom listbox that lets the user pick several values. Built as its own component
 * (rather than overloading Dropdown) because the value contract differs: `values: T[]` in/out.
 * Selected values show as removable chips in the trigger; each option row carries a checkbox and
 * toggles without closing the list (multi-select stays open). Closes on outside pointerdown / Escape.
 * Shares the trigger/list/option look with Dropdown via select-shared.css.
 */
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { Size } from '../../enums'
import type { DropdownOption, SelectAlign } from '../Dropdown'
import '../select-shared.css'
import './style.css'

export interface MultiSelectProps<T extends string> {
	values: T[]
	options: ReadonlyArray<DropdownOption<T>>
	onChange: (values: T[]) => void
	label?: string
	placeholder?: string
	size?: Size
	disabled?: boolean
	fullWidth?: boolean
	align?: SelectAlign
	className?: string
}

export function MultiSelect<T extends string>({
	values,
	options,
	onChange,
	label,
	placeholder = 'Select…',
	size = Size.Medium,
	disabled = false,
	fullWidth = false,
	align = 'left',
	className = '',
}: MultiSelectProps<T>) {
	const id = useId()
	const rootRef = useRef<HTMLDivElement>(null)
	const [open, setOpen] = useState(false)
	const selectedSet = new Set(values)

	/* Toggle one value in/out of the selection without closing the list. */
	const toggle = useCallback(
		(opt: DropdownOption<T>) => {
			if (opt.disabled) return
			const next = new Set(values)
			if (next.has(opt.value)) next.delete(opt.value)
			else next.add(opt.value)
			onChange(options.filter((o) => next.has(o.value)).map((o) => o.value))
		},
		[onChange, options, values],
	)

	/* Remove a single chip (used by the × on each selected chip). */
	const remove = useCallback(
		(value: T) => {
			onChange(values.filter((v) => v !== value))
		},
		[onChange, values],
	)

	/* Close the list when a pointer goes down anywhere outside this control. */
	useEffect(() => {
		if (!open) return
		const onPointerDown = (e: MouseEvent) => {
			if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
		}
		document.addEventListener('mousedown', onPointerDown, true)
		return () => document.removeEventListener('mousedown', onPointerDown, true)
	}, [open])

	const selectedOptions = options.filter((o) => selectedSet.has(o.value))
	const classes = ['leap-select', 'leap-multiselect', `leap-select--${size}`, fullWidth ? 'leap-select--full' : '', className]
		.filter(Boolean)
		.join(' ')

	return (
		<div className={classes} ref={rootRef}>
			{label != null && (
				<label className="leap-select__label" htmlFor={id}>
					{label}
				</label>
			)}
			<div className="leap-select__control">
				<button
					id={id}
					type="button"
					className="leap-select__trigger leap-multiselect__trigger"
					disabled={disabled}
					aria-haspopup="listbox"
					aria-expanded={open}
					onClick={() => !disabled && setOpen((v) => !v)}
				>
					{selectedOptions.length === 0 ? (
						<span className={`leap-select__value leap-select__value--placeholder leap-select__value--${align}`}>{placeholder}</span>
					) : (
						<span className="leap-multiselect__chips">
							{selectedOptions.map((opt) => (
								<span key={opt.value} className="leap-multiselect__chip">
									{opt.label}
									<span
										className="leap-multiselect__chip-remove"
										role="button"
										aria-label={`Remove ${opt.label}`}
										onClick={(e) => {
											e.stopPropagation()
											remove(opt.value)
										}}
									>
										×
									</span>
								</span>
							))}
						</span>
					)}
					<span className="leap-select__caret">
						<span className="leap-select__chevron" aria-hidden="true" />
					</span>
				</button>
				{open && (
					<ul className="leap-select__list" role="listbox" aria-multiselectable="true" tabIndex={-1}>
						{options.map((opt) => {
							const checked = selectedSet.has(opt.value)
							const optionClasses = [
								'leap-select__option',
								checked ? 'is-selected' : '',
								opt.disabled ? 'is-disabled' : '',
							]
								.filter(Boolean)
								.join(' ')
							return (
								<li
									key={opt.value}
									role="option"
									aria-selected={checked}
									className={optionClasses}
									onClick={() => toggle(opt)}
								>
									<span className={`leap-multiselect__check ${checked ? 'is-checked' : ''}`} aria-hidden="true" />
									{opt.label}
								</li>
							)
						})}
					</ul>
				)}
			</div>
		</div>
	)
}
