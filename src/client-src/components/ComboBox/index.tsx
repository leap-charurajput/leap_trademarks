/*
 * ComboBox — an Illustrator-style editable select (like the font field). It always shows an editable
 * text input plus a caret cell on the right, separated by a divider line. Interaction model:
 *   - Clicking the text field focuses it for typing and does NOT open the option list.
 *   - Typing filters and opens the list (so matches are shown as you type).
 *   - Clicking the caret toggles the list open/closed.
 *   - Selecting an option, or pressing Enter, commits; Escape reverts; outside-click commits + closes.
 * When allowCustomValue is true the typed text can be committed even if it is not in the list.
 * Focused field shows the Illustrator blue border + white background. Shares list/option look via
 * select-shared.css.
 */
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { Size } from '../../enums'
import type { DropdownOption, SelectAlign } from '../Dropdown'
import '../select-shared.css'
import './style.css'

export interface ComboBoxProps<T extends string> {
	value: string
	options: ReadonlyArray<DropdownOption<T>>
	onChange: (value: string) => void
	label?: string
	placeholder?: string
	size?: Size
	disabled?: boolean
	fullWidth?: boolean
	allowCustomValue?: boolean
	align?: SelectAlign
	className?: string
}

export function ComboBox<T extends string>({
	value,
	options,
	onChange,
	label,
	placeholder = 'Type or select…',
	size = Size.Medium,
	disabled = false,
	fullWidth = false,
	allowCustomValue = true,
	align = 'left',
	className = '',
}: ComboBoxProps<T>) {
	const id = useId()
	const rootRef = useRef<HTMLDivElement>(null)
	const inputRef = useRef<HTMLInputElement>(null)
	const focusedRef = useRef(false)
	const [open, setOpen] = useState(false)
	const [draft, setDraft] = useState('')
	const [activeIndex, setActiveIndex] = useState(0)

	/* Text to display at rest: the matching option's label, else the raw value. */
	const displayLabel = useMemo(() => {
		const match = options.find((o) => o.value === value)
		return match ? match.label : value
	}, [options, value])

	/* Keep the draft in sync with the committed value while the field is not being edited. */
	useEffect(() => {
		if (!focusedRef.current) setDraft(displayLabel)
	}, [displayLabel])

	/* Options filtered by the current draft (case-insensitive substring on label or value). */
	const filtered = useMemo(() => {
		const q = draft.trim().toLowerCase()
		if (!q) return options
		return options.filter((o) => o.label.toLowerCase().includes(q) || o.value.toLowerCase().includes(q))
	}, [draft, options])

	/* Commit a concrete value and close the list. */
	const commitValue = useCallback(
		(next: string) => {
			onChange(next)
			setOpen(false)
		},
		[onChange],
	)

	/* Commit the typed draft (matched option preferred; custom text only if allowed). */
	const commitDraft = useCallback(() => {
		const trimmed = draft.trim()
		const match = options.find(
			(o) => o.label.toLowerCase() === trimmed.toLowerCase() || o.value.toLowerCase() === trimmed.toLowerCase(),
		)
		if (match) commitValue(match.value)
		else if (allowCustomValue) commitValue(trimmed)
		else {
			setDraft(displayLabel)
			setOpen(false)
		}
	}, [allowCustomValue, commitValue, displayLabel, draft, options])

	/* Outside pointerdown commits the draft and closes — clicking the body closes the list. */
	useEffect(() => {
		const onPointerDown = (e: MouseEvent) => {
			if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
				if (focusedRef.current || open) commitDraft()
			}
		}
		document.addEventListener('mousedown', onPointerDown, true)
		return () => document.removeEventListener('mousedown', onPointerDown, true)
	}, [open, commitDraft])

	/* Caret toggles the list; clicking the caret also focuses the input for immediate typing. */
	const toggleList = () => {
		if (disabled) return
		setOpen((v) => !v)
		inputRef.current?.focus()
	}

	/* Keyboard model while typing. */
	const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
		if (e.key === 'Escape') {
			e.preventDefault()
			setDraft(displayLabel)
			setOpen(false)
		} else if (e.key === 'ArrowDown') {
			e.preventDefault()
			if (!open) setOpen(true)
			else setActiveIndex((i) => Math.min(filtered.length - 1, i + 1))
		} else if (e.key === 'ArrowUp') {
			e.preventDefault()
			setActiveIndex((i) => Math.max(0, i - 1))
		} else if (e.key === 'Enter') {
			e.preventDefault()
			const opt = open ? filtered[activeIndex] : undefined
			if (opt) commitValue(opt.value)
			else commitDraft()
		}
	}

	const classes = ['leap-select', 'leap-combobox', `leap-select--${size}`, fullWidth ? 'leap-select--full' : '', className]
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
				<div className={`leap-combobox__field ${open ? 'is-open' : ''}`}>
					<input
						id={id}
						ref={inputRef}
						type="text"
						className={`leap-combobox__input leap-select__value--${align}`}
						value={draft}
						placeholder={placeholder}
						disabled={disabled}
						onFocus={() => {
							focusedRef.current = true
						}}
						onBlur={() => {
							focusedRef.current = false
						}}
						onChange={(e) => {
							setDraft(e.target.value)
							setActiveIndex(0)
							if (!open) setOpen(true)
						}}
						onKeyDown={onKeyDown}
					/>
					<span className="leap-combobox__divider" aria-hidden="true" />
					<button
						type="button"
						className="leap-combobox__caret"
						disabled={disabled}
						aria-haspopup="listbox"
						aria-expanded={open}
						aria-label="Toggle options"
						onClick={toggleList}
					>
						<span className="leap-select__chevron" aria-hidden="true" />
					</button>
				</div>
				{open && (
					<ul className="leap-select__list leap-combobox__list" role="listbox" tabIndex={-1}>
						{filtered.length === 0 ? (
							<li className="leap-select__empty">{allowCustomValue ? 'Press Enter to add' : 'No matches'}</li>
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
											// mousedown (not click) so it fires before the input blur closes the list.
											e.preventDefault()
											if (!opt.disabled) commitValue(opt.value)
										}}
									>
										{opt.label}
									</li>
								)
							})
						)}
					</ul>
				)}
			</div>
		</div>
	)
}
