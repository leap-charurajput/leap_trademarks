/*
 * FieldSet — a native <fieldset>/<legend> group for related controls, themed for Illustrator. Use it
 * to visually bundle a set of fields under one heading (e.g. "PNG options").
 */
import type { ReactNode } from 'react'
import './style.css'

export interface FieldSetProps {
	legend?: string
	disabled?: boolean
	fullWidth?: boolean
	className?: string
	children: ReactNode
}

export function FieldSet({ legend, disabled, fullWidth, className = '', children }: FieldSetProps) {
	const classes = ['leap-fieldset', fullWidth ? 'leap-fieldset--full' : '', className].filter(Boolean).join(' ')
	return (
		<fieldset className={classes} disabled={disabled}>
			{legend != null && <legend className="leap-fieldset__legend">{legend}</legend>}
			<div className="leap-fieldset__body">{children}</div>
		</fieldset>
	)
}
