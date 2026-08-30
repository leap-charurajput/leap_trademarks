/*
 * SearchSelect — a single-select whose popup has a search field pinned at the top. As soon as the
 * user types, the option list filters to matches (case-insensitive substring on label or value).
 * Unlike ComboBox it does not accept custom values — it only narrows an existing list. Optional
 * selected tick (showSelectedTick). Shares the select look via select-shared.css.
 */
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { Size } from '../../enums'
import type { DropdownOption, SelectAlign } from '../Dropdown'
import '../select-shared.css'
import type { CSSProperties } from 'react'

/* Inline background for an option's optional swatch: two-colour split > single colour > none. */
function swatchStyle<T extends string>(opt: DropdownOption<T>): CSSProperties | null {
	if (opt.colors) return { background: `linear-gradient(to bottom right, ${opt.colors[0]} 0 50%, ${opt.colors[1]} 50% 100%)` }
	if (opt.color) return { background: opt.color }
	return null
}

export interface SearchSelectProps<T extends string> {
	value: T
	options: ReadonlyArray<DropdownOption<T>>
	onChange: (value: T) => void
	label?: string
	placeholder?: string
	searchPlaceholder?: string
	size?: Size
	disabled?: boolean
	fullWidth?: boolean
	showSelectedTick?: boolean
	align?: SelectAlign
	className?: string
}

export function SearchSelect<T extends string>({
	value,
	options,
	onChange,
	label,
	placeholder = 'Select…',
	searchPlaceholder = 'Search…',
	size = Size.Medium,
	disabled = false,
	fullWidth = false,
	showSelectedTick = false,
	align = 'left',
	className = '',
}: SearchSelectProps<T>) {
	const id = useId()
	const rootRef = useRef<HTMLDivElement>(null)
	const searchRef = useRef<HTMLInputElement>(null)
	const [open, setOpen] = useState(false)
	const [query, setQuery] = useState('')
	const [activeIndex, setActiveIndex] = useState(0)

	const selected = options.find((o) => o.value === value)

	/* Options filtered by the current query (label or value contains, case-insensitive). */
	const filtered = useMemo(() => {
		const q = query.trim().toLowerCase()
		if (!q) return options
		return options.filter((o) => o.label.toLowerCase().includes(q) || o.value.toLowerCase().includes(q))
	}, [query, options])

	/* Commit a selection, clear the query and close. */
	const commit = useCallback(
		(opt: DropdownOption<T>) => {
			if (opt.disabled) return
			onChange(opt.value)
			setQuery('')
			setOpen(false)
		},
		[onChange],
	)

	/* Close on outside pointerdown. */
	useEffect(() => {
		if (!open) return
		const onPointerDown = (e: MouseEvent) => {
			if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
				setOpen(false)
				setQuery('')
			}
		}
		document.addEventListener('mousedown', onPointerDown, true)
		return () => document.removeEventListener('mousedown', onPointerDown, true)
	}, [open])

	/* Focus the search field when the popup opens; reset the highlight as the query changes. */
	useEffect(() => {
		if (open) searchRef.current?.focus()
	}, [open])
	useEffect(() => {
		setActiveIndex(0)
	}, [query])

	/* Keyboard model inside the search field. */
	const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
		if (e.key === 'Escape') {
			e.preventDefault()
			setOpen(false)
			setQuery('')
		} else if (e.key === 'ArrowDown') {
			e.preventDefault()
			setActiveIndex((i) => Math.min(filtered.length - 1, i + 1))
		} else if (e.key === 'ArrowUp') {
			e.preventDefault()
			setActiveIndex((i) => Math.max(0, i - 1))
		} else if (e.key === 'Enter') {
			e.preventDefault()
			const opt = filtered[activeIndex]
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
				>
					<span className={`leap-select__value leap-select__value--with-swatch leap-select__value--${align} ${selected ? '' : 'leap-select__value--placeholder'}`}>
						{selected && swatchStyle(selected) && (
							<span className="leap-select__swatch leap-select__swatch--sm" style={swatchStyle(selected)!} aria-hidden="true" />
						)}
						{selected?.label ?? placeholder}
					</span>
					<span className="leap-select__caret">
						<span className="leap-select__chevron" aria-hidden="true" />
					</span>
				</button>
				{open && (
					<div className="leap-select__list" role="listbox">
						<div className="leap-select__search-wrap">
							<input
								ref={searchRef}
								type="text"
								className="leap-select__search"
								value={query}
								placeholder={searchPlaceholder}
								onChange={(e) => setQuery(e.target.value)}
								onKeyDown={onKeyDown}
							/>
						</div>
						<ul className="leap-select__options" role="presentation">
							{filtered.length === 0 ? (
								<li className="leap-select__empty">No matches</li>
							) : (
								filtered.map((opt, index) => {
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
											onMouseDown={(e) => {
												e.preventDefault()
												commit(opt)
											}}
										>
											{showSelectedTick && (
												<span className={`leap-select__tick ${opt.value === value ? 'is-visible' : ''}`} aria-hidden="true" />
											)}
											{swatchStyle(opt) && (
												<span className="leap-select__swatch leap-select__swatch--sm" style={swatchStyle(opt)!} aria-hidden="true" />
											)}
											{opt.label}
										</li>
									)
								})
							)}
						</ul>
					</div>
				)}
			</div>
		</div>
	)
}
