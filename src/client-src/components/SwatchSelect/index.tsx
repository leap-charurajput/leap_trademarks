/*
 * SwatchSelect — a single-select where each option shows a colour/image swatch on the left, plus a
 * matching swatch in the trigger. A swatch can be a single colour, a two-colour diagonal split
 * (top-left / bottom-right, like a team's primary+secondary colour), or an image. Useful for team /
 * colour pickers. Optional selected tick (showSelectedTick). Shares the select look via
 * select-shared.css; swatch fills are inline styles because the colours are dynamic data.
 */
import { useCallback, useEffect, useId, useRef, useState, type CSSProperties } from 'react'
import { Size } from '../../enums'
import type { SelectAlign } from '../Dropdown'
import '../select-shared.css'

export interface SwatchOption<T extends string> {
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

export interface SwatchSelectProps<T extends string> {
	value: T
	options: ReadonlyArray<SwatchOption<T>>
	onChange: (value: T) => void
	label?: string
	size?: Size
	disabled?: boolean
	fullWidth?: boolean
	showSelectedTick?: boolean
	align?: SelectAlign
	className?: string
}

/* Build the inline background for a swatch: image > two-colour split > single colour > transparent. */
function swatchStyle<T extends string>(opt: SwatchOption<T>): CSSProperties {
	if (opt.image) return { backgroundImage: `url("${opt.image}")` }
	if (opt.colors) return { background: `linear-gradient(to bottom right, ${opt.colors[0]} 0 50%, ${opt.colors[1]} 50% 100%)` }
	if (opt.color) return { background: opt.color }
	return { background: 'transparent' }
}

export function SwatchSelect<T extends string>({
	value,
	options,
	onChange,
	label,
	size = Size.Medium,
	disabled = false,
	fullWidth = false,
	showSelectedTick = false,
	align = 'left',
	className = '',
}: SwatchSelectProps<T>) {
	const id = useId()
	const rootRef = useRef<HTMLDivElement>(null)
	const [open, setOpen] = useState(false)
	const [activeIndex, setActiveIndex] = useState<number>(() => options.findIndex((o) => o.value === value))

	const selected = options.find((o) => o.value === value)

	/* Commit a selection and close the list. */
	const commit = useCallback(
		(opt: SwatchOption<T>) => {
			if (opt.disabled) return
			onChange(opt.value)
			setOpen(false)
		},
		[onChange],
	)

	/* Close the list on outside pointerdown. */
	useEffect(() => {
		if (!open) return
		const onPointerDown = (e: MouseEvent) => {
			if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
		}
		document.addEventListener('mousedown', onPointerDown, true)
		return () => document.removeEventListener('mousedown', onPointerDown, true)
	}, [open])

	/* Highlight the current value whenever the list opens. */
	useEffect(() => {
		if (open) setActiveIndex(options.findIndex((o) => o.value === value))
	}, [open, options, value])

	const classes = ['leap-select', `leap-select--${size}`, fullWidth ? 'leap-select--full' : '', className]
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
					className="leap-select__trigger"
					disabled={disabled}
					aria-haspopup="listbox"
					aria-expanded={open}
					onClick={() => !disabled && setOpen((v) => !v)}
				>
					<span className={`leap-select__value leap-select__value--with-swatch leap-select__value--${align}`}>
						{selected && <span className="leap-select__swatch leap-select__swatch--sm" style={swatchStyle(selected)} aria-hidden="true" />}
						{selected?.label ?? ''}
					</span>
					<span className="leap-select__caret">
						<span className="leap-select__chevron" aria-hidden="true" />
					</span>
				</button>
				{open && (
					<ul className="leap-select__list" role="listbox" tabIndex={-1}>
						{options.map((opt, index) => {
							const optionClasses = [
								'leap-select__option',
								opt.value === value ? 'is-selected' : '',
								index === activeIndex ? 'is-active' : '',
								opt.disabled ? 'is-disabled' : '',
							]
								.filter(Boolean)
								.join(' ')
							return (
								<li
									key={opt.value}
									role="option"
									aria-selected={opt.value === value}
									className={optionClasses}
									onMouseEnter={() => setActiveIndex(index)}
									onClick={() => commit(opt)}
								>
									{showSelectedTick && (
										<span className={`leap-select__tick ${opt.value === value ? 'is-visible' : ''}`} aria-hidden="true" />
									)}
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
