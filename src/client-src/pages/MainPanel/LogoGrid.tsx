/*
 * LogoGrid — shared list/grid of logo thumbnails used by the Teams, League and League Logos views
 * (legacy `.verbiage-bg-box` / `logoSection`). Each cell paints the logo's background colour and, on
 * hover, shows an "add to document" action. When the logo has a set name (loaded from the
 * server JSON), its Set Name is shown as a yellow badge on the thumbnail (legacy tag). Each cell has a
 * tooltip with the file name + colour. Display colours come from data, so the cell background and the
 * badge are the permitted inline styles (AGENTS §2.2).
 */
import { useEffect, useRef, useState, type UIEvent } from 'react'
import { Tooltip } from '../../components'
import { LogoImage } from './LogoImage'
import type { ColorView, Logo } from '../../data/types'

/* How many logos to render initially and add each time the user nears the bottom. */
const PAGE = 48

export interface LogoGridProps {
	logos: Logo[]
	view?: ColorView
	onAdd?: (logo: Logo) => void
	emptyText?: string
	/* Show the yellow Set Name badge on each thumbnail (Teams view); off for the League grid. */
	showSetBadge?: boolean
	/* Let the grid grow to fill the available vertical space (League tab) instead of a fixed cap. */
	fill?: boolean
}

/*
 * Pick a readable text colour (white on dark, near-black on light) for a hex background, so the
 * list-view file name stays legible whatever the logo's background colour is. Falls back to undefined
 * (theme default) when there is no background colour. Uses the standard sRGB luminance threshold.
 */
function readableTextOn(hex: string | undefined): string | undefined {
	if (!hex) return undefined
	const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
	if (!m) return undefined
	const n = parseInt(m[1], 16)
	const r = (n >> 16) & 0xff
	const g = (n >> 8) & 0xff
	const b = n & 0xff
	const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
	return luminance < 0.55 ? '#ffffff' : '#1d1d1d'
}

export function LogoGrid({ logos, view = 'grid', onAdd, emptyText = 'No logos.', showSetBadge = true, fill = false }: LogoGridProps) {
	/* Render only `count` cells; grow the window as the user scrolls near the bottom (infinite scroll),
	   so a league with hundreds of logos never mounts them all at once. */
	const [count, setCount] = useState(PAGE)
	const scrollRef = useRef<HTMLDivElement | null>(null)

	/* Reset the window whenever the list changes (new league / filter). */
	useEffect(() => {
		setCount(PAGE)
		if (scrollRef.current) scrollRef.current.scrollTop = 0
	}, [logos])

	const onScroll = (e: UIEvent<HTMLDivElement>) => {
		const el = e.currentTarget
		if (el.scrollTop + el.clientHeight >= el.scrollHeight - 160) {
			setCount((c) => (c < logos.length ? c + PAGE : c))
		}
	}

	if (logos.length === 0) return <p className="tm-empty">{emptyText}</p>

	const shown = logos.slice(0, count)

	return (
		<div ref={scrollRef} onScroll={onScroll} className={`tm-logos tm-logos--${view} ${fill ? 'tm-logos--fill' : ''} leap-scroll`}>
			{shown.map((logo) => (
				<Tooltip key={logo.id} content={`${logo.SetName} · ${logo.FileName}`}>
					<div className="tm-logo" style={{ backgroundColor: logo.colorInfo?.Hex ?? 'transparent' }}>
						<LogoImage src={logo.imgSrc} fallback={logo.imgFallback} alt={logo.FileName} />
						{showSetBadge && logo.SetName && <span className="tm-logo__tag">{logo.SetName}</span>}
						{view === 'list' && (
							<span className="tm-logo__name" style={{ color: readableTextOn(logo.colorInfo?.Hex) }}>
								{logo.FileName}
							</span>
						)}
						{onAdd && (
							<button
								type="button"
								className="tm-logo__add"
								aria-label="Add to document"
								/* Prevent the button taking focus on click — focusing it scrolls the grid to bring it
								   fully into view, which looked like the cell "jumping". */
								onMouseDown={(e) => e.preventDefault()}
								/* Only this button adds the logo — stop the click from bubbling to the cell. */
								onClick={(e) => {
									e.stopPropagation()
									onAdd(logo)
								}}
							>
								<span className="exp-icon exp-icon--sm exp-icon--add-document" aria-hidden />
							</button>
						)}
					</div>
				</Tooltip>
			))}
		</div>
	)
}
