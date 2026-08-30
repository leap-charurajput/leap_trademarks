/*
 * ProgressBar — a themed determinate/indeterminate progress indicator (legacy progressBar.jsx). Pass
 * `value` 0–100 for determinate; omit (or null) for an indeterminate animated bar. Optional label +
 * percentage readout.
 */
import './style.css'

export interface ProgressBarProps {
	value?: number | null
	label?: string
	showPercent?: boolean
	className?: string
}

export function ProgressBar({ value = null, label, showPercent = true, className = '' }: ProgressBarProps) {
	const indeterminate = value == null
	const pct = indeterminate ? 0 : Math.min(100, Math.max(0, value))
	const fillStyle = indeterminate ? undefined : ({ width: `${pct}%` } as React.CSSProperties)

	return (
		<div className={['leap-progress', className].filter(Boolean).join(' ')}>
			{(label || (showPercent && !indeterminate)) && (
				<div className="leap-progress__meta">
					{label && <span className="leap-progress__label">{label}</span>}
					{showPercent && !indeterminate && <span className="leap-progress__percent">{Math.round(pct)}%</span>}
				</div>
			)}
			<div className="leap-progress__track">
				<div className={`leap-progress__fill ${indeterminate ? 'is-indeterminate' : ''}`} style={fillStyle} />
			</div>
		</div>
	)
}
