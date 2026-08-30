/*
 * SearchInput — a labelled search field (native input[type=search]) with a clear (×) button shown
 * when there is text. onChange returns the string; onSearch (optional) fires on Enter.
 */
import { useId } from 'react'
import { Field } from '../Field'
import '../field-shared.css'
import './style.css'

export interface SearchInputProps {
	value: string
	onChange: (value: string) => void
	onSearch?: (value: string) => void
	label?: string
	hint?: string
	error?: string
	fullWidth?: boolean
	placeholder?: string
	disabled?: boolean
	id?: string
	className?: string
}

export function SearchInput({ value, onChange, onSearch, label, hint, error, fullWidth, placeholder = 'Search…', disabled, id, className = '' }: SearchInputProps) {
	const autoId = useId()
	const inputId = id ?? autoId

	return (
		<Field label={label} hint={hint} error={error} htmlFor={inputId} disabled={disabled} fullWidth={fullWidth} className={className}>
			<div className="leap-search__control">
				<input
					id={inputId}
					type="search"
					className="leap-input leap-search__input"
					value={value}
					placeholder={placeholder}
					disabled={disabled}
					onChange={(e) => onChange(e.target.value)}
					onKeyDown={(e) => {
						if (e.key === 'Enter') onSearch?.(value)
					}}
				/>
				{value && !disabled && (
					<button type="button" className="leap-search__clear" tabIndex={-1} aria-label="Clear" onClick={() => onChange('')}>
						×
					</button>
				)}
			</div>
		</Field>
	)
}
