/*
 * FileInput — a labelled native file picker styled as a "Choose…" button plus the selected file
 * name. The native input is visually hidden and triggered via the button. onChange returns the
 * FileList (or null). `accept` and `multiple` pass through to the native input.
 *
 * Note: this is the pure-HTML file picker. In a CEP/UXP host, a *folder* picker should call the host
 * dialog instead — that belongs in a host-backed component, not here.
 */
import { useId, useRef, type ChangeEvent } from 'react'
import { Field } from '../Field'
import { Button } from '../Button'
import { ButtonVariant, Size } from '../../enums'
import '../field-shared.css'
import './style.css'

export interface FileInputProps {
	onChange: (files: FileList | null) => void
	label?: string
	hint?: string
	error?: string
	buttonLabel?: string
	accept?: string
	multiple?: boolean
	fullWidth?: boolean
	disabled?: boolean
	id?: string
	className?: string
}

export function FileInput({ onChange, label, hint, error, buttonLabel = 'Choose…', accept, multiple, fullWidth, disabled, id, className = '' }: FileInputProps) {
	const autoId = useId()
	const inputId = id ?? autoId
	const inputRef = useRef<HTMLInputElement>(null)
	const fileName = (() => {
		const files = inputRef.current?.files
		if (!files || files.length === 0) return 'No file chosen'
		if (files.length === 1) return files[0].name
		return `${files.length} files`
	})()

	const handle = (e: ChangeEvent<HTMLInputElement>) => onChange(e.target.files)

	return (
		<Field label={label} hint={hint} error={error} htmlFor={inputId} disabled={disabled} fullWidth={fullWidth} className={className}>
			<div className="leap-fileinput__control">
				<input ref={inputRef} id={inputId} type="file" className="leap-fileinput__native" accept={accept} multiple={multiple} disabled={disabled} onChange={handle} />
				<Button variant={ButtonVariant.Secondary} size={Size.Small} disabled={disabled} onClick={() => inputRef.current?.click()}>
					{buttonLabel}
				</Button>
				<span className="leap-fileinput__name">{fileName}</span>
			</div>
		</Field>
	)
}
