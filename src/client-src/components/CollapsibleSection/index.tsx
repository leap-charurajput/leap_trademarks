/*
 * CollapsibleSection — a themed native <details>/<summary> disclosure (the legacy panel used
 * <details> for its "Versions to Process" / "Export Options" sections). Native keeps it accessible
 * and keyboard-friendly with no JS. `defaultOpen` sets the initial state; an optional `right` slot
 * renders an action (e.g. a refresh icon) on the summary row.
 */
import type { ReactNode } from 'react'
import './style.css'

export interface CollapsibleSectionProps {
	title: string
	defaultOpen?: boolean
	right?: ReactNode
	className?: string
	children: ReactNode
}

export function CollapsibleSection({ title, defaultOpen = true, right, className = '', children }: CollapsibleSectionProps) {
	return (
		<details className={['leap-collapsible', className].filter(Boolean).join(' ')} open={defaultOpen}>
			<summary className="leap-collapsible__summary">
				<span className="leap-collapsible__chevron" aria-hidden="true" />
				<span className="leap-collapsible__title">{title}</span>
				{right != null && (
					<span className="leap-collapsible__right" onClick={(e) => e.stopPropagation()}>
						{right}
					</span>
				)}
			</summary>
			<div className="leap-collapsible__body">{children}</div>
		</details>
	)
}
