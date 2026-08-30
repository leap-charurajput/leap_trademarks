/*
 * MultiSwatchSelect — a multi-select where every option carries a colour/image swatch (like
 * SwatchSelect) but several can be picked at once (like MultiSelect). The value contract is
 * `values: T[]` in/out; selected values show as swatch chips in the trigger, and each option row has
 * a checkbox + swatch and toggles without closing the list. Built for "pick which swatches to
 * include/omit" pickers. Shares the trigger/list/option/swatch look with the other selects via
 * select-shared.css, and the chip/checkbox glyphs with MultiSelect via its style.css.
 */
import { useCallback, useEffect, useId, useRef, useState, type CSSProperties } from 'react'
import { Size } from '../../enums'
import type { SelectAlign } from '../Dropdown'
import '../select-shared.css'
import './style.css'

export interface MultiSwatchOption<T extends string> {
	value: T
	label: string
	disabled?: boolean
	/* Single fill colour (any CSS colour, e.g. a hex). */
	color?: string
	/* Two-colour diagonal split: [topLeft, bottomRight]. Takes precedence over `color`. */
	colors?: [string, string]
	/* Image URL; takes precedence over colours. */
	image?: string
}

export interface MultiSwatchSelectProps<T extends string> {
	values: T[]
	options: ReadonlyArray<MultiSwatchOption<T>>
	onChange: (values: T[]) => void
	label?: string
	placeholder?: string
	size?: Size
	disabled?: boolean
	fullWidth?: boolean
	align?: SelectAlign
	className?: string
}

/* Build the inline background for a swatch: image > two-colour split > single colour > transparent. */
function swatchStyle<T extends string>(opt: MultiSwatchOption<T>): CSSProperties {
	if (opt.image) return { backgroundImage: `url("${opt.image}")` }
	if (opt.colors) return { background: `linear-gradient(to bottom right, ${opt.colors[0]} 0 50%, ${opt.colors[1]} 50% 100%)` }
	if (opt.color) return { background: opt.color }
	return { background: 'transparent' }
}

export function MultiSwatchSelect<T extends string>({
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
}: MultiSwatchSelectProps<T>) {
	const id = useId()
	const rootRef = useRef<HTMLDivElement>(null)
	const [open, setOpen] = useState(false)
	const selectedSet = new Set(values)

	/* Toggle one value in/out of the selection without closing the list (stays open for multi-pick). */
	const toggle = useCallback(
		(opt: MultiSwatchOption<T>) => {
			if (opt.disabled) return
			const next = new Set(values)
			if (next.has(opt.value)) next.delete(opt.value)
			else next.add(opt.value)
			onChange(options.filter((o) => next.has(o.value)).map((o) => o.value))
		},
		[onChange, options, values],
	)

	/* Remove a single chip (the × on each selected chip). */
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
									<span className="leap-select__swatch leap-select__swatch--sm" style={swatchStyle(opt)} aria-hidden="true" />
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
									<span className="leap-select__swatch" style={swatchStyle(opt)} aria-hidden="true" />
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
