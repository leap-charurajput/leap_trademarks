/*
 * Dropdown — a custom single-select listbox (NOT a native <select>). A native select's option list
 * is drawn by the OS on macOS and ignores CSS, so its hover colour cannot be themed; CEP panels
 * therefore need a custom list to render the Illustrator hover fill on options. Same public API as
 * before (value / options / onChange / label / size / disabled / fullWidth). Closes on outside
 * pointerdown, Escape, or selection; supports basic keyboard nav. Shared look in select-shared.css.
 */
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { Size } from '../../enums'
import '../select-shared.css'

export interface DropdownOption<T extends string> {
	value: T
	label: string
	disabled?: boolean
	/* Optional single colour for a leading swatch (rendered by selects that support swatches). */
	color?: string
	/* Optional two-colour diagonal split [topLeft, bottomRight]; takes precedence over `color`. */
	colors?: [string, string]
}

/* Horizontal alignment of the displayed value / option text. Default is 'left'. */
export type SelectAlign = 'left' | 'center' | 'right'

export interface DropdownProps<T extends string> {
	value: T
	options: ReadonlyArray<DropdownOption<T>>
	onChange: (value: T) => void
	label?: string
	size?: Size
	disabled?: boolean
	fullWidth?: boolean
	/* Show a left-aligned checkmark on the selected row (Illustrator stroke-weight style). Off by default. */
	showSelectedTick?: boolean
	/* Alignment of the value + option text (default 'left'). */
	align?: SelectAlign
	className?: string
}

export function Dropdown<T extends string>({
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
}: DropdownProps<T>) {
	const id = useId()
	const rootRef = useRef<HTMLDivElement>(null)
	const [open, setOpen] = useState(false)
	const [activeIndex, setActiveIndex] = useState<number>(() => options.findIndex((o) => o.value === value))

	const selected = options.find((o) => o.value === value)

	/* Commit a selection: notify the caller and close the list. */
	const commit = useCallback(
		(next: DropdownOption<T>) => {
			if (next.disabled) return
			onChange(next.value)
			setOpen(false)
		},
		[onChange],
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

	/* Sync the highlighted row to the current value each time the list opens. */
	useEffect(() => {
		if (open) setActiveIndex(options.findIndex((o) => o.value === value))
	}, [open, options, value])

	/* Keyboard model: arrows move/commit, Enter/Space open or commit, Escape closes. */
	const onKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
		if (disabled) return
		if (!open) {
			if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
				e.preventDefault()
				setOpen(true)
			}
			return
		}
		if (e.key === 'Escape') {
			e.preventDefault()
			setOpen(false)
		} else if (e.key === 'ArrowDown') {
			e.preventDefault()
			setActiveIndex((i) => Math.min(options.length - 1, i + 1))
		} else if (e.key === 'ArrowUp') {
			e.preventDefault()
			setActiveIndex((i) => Math.max(0, i - 1))
		} else if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault()
			const opt = options[activeIndex]
			if (opt) commit(opt)
		}
	}

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
					onKeyDown={onKeyDown}
				>
					<span className={`leap-select__value leap-select__value--${align}`}>{selected?.label ?? ''}</span>
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
