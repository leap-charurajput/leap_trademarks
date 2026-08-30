/*
 * Section — a titled, bordered content box (the legacy panel grouped each area in its own box). A
 * heading row (with an optional right-aligned action, e.g. a refresh icon) sits above a bordered
 * body. Non-collapsible by design, matching the legacy panel's grouped layout.
 */
import type { ReactNode } from 'react'
import './style.css'

export interface SectionProps {
	title: string
	right?: ReactNode
	className?: string
	children: ReactNode
}

export function Section({ title, right, className = '', children }: SectionProps) {
	return (
		<section className={['leap-section', className].filter(Boolean).join(' ')}>
			<div className="leap-section__head">
				<span className="leap-section__title">{title}</span>
				{right != null && <span className="leap-section__right">{right}</span>}
			</div>
			<div className="leap-section__box">{children}</div>
		</section>
	)
}
