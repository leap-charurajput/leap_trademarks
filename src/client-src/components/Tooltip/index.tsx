/**
 * Tooltip — hover only. CEP/Illustrator often fires mouseenter/mousemove on click, so we lean on the
 * global pointer-down/click suppression (see tooltipController) plus a buttons-down guard to filter
 * phantom hovers, and a simple dwell delay. The bubble is portaled and clamped to the viewport so it
 * never gets clipped by the panel edges (the panel is only ~250px wide).
 *
 * Debug: localStorage.setItem('leap-trademarks:tooltip-debug', '1')
 */
import {
	Children,
	cloneElement,
	isValidElement,
	useCallback,
	useEffect,
	useId,
	useLayoutEffect,
	useRef,
	useState,
	type CSSProperties,
	type ReactElement,
	type ReactNode,
	type MouseEvent,
	type FocusEvent,
} from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from '../../context/LocaleContext'
import type { TranslationKey, TranslationParams } from '../../i18n'
import {
	installGlobalTooltipSuppressListeners,
	isTooltipGloballySuppressed,
	subscribeTooltipSuppress,
	suppressAllTooltips,
} from '../../utils/tooltipController'
import './style.css'

export interface TooltipProps {
	i18nKey?: TranslationKey
	params?: TranslationParams
	content?: ReactNode
	placement?: 'top' | 'bottom' | 'left' | 'right'
	showDelayMs?: number
	children: ReactNode
}

const GAP = 8
/** Keep the bubble at least this far from every viewport edge so it's never clipped. */
const VIEWPORT_MARGIN = 6
const DEFAULT_SHOW_DELAY_MS = 500

/* Read the debug flag once at module load (not on every tooltip show/hide). */
const TOOLTIP_DEBUG = (() => {
	try {
		return localStorage.getItem('leap-trademarks:tooltip-debug') === '1'
	} catch {
		return false
	}
})()

function isTooltipDebug(): boolean {
	return TOOLTIP_DEBUG
}

function debugLog(message: string, detail?: Record<string, unknown>): void {
	if (!isTooltipDebug()) return
	console.log(`[Tooltip] ${message}`, detail ?? '')
}

function getPortalRoot(): HTMLElement {
	return document.getElementById('root') ?? document.body
}

/**
 * Compute a viewport-clamped {top,left} for the bubble given the anchor and the measured bubble box.
 * No CSS transforms — we position by raw coordinates so clamping math is exact and nothing overflows
 * (and thus nothing gets clipped) on the narrow panel.
 */
function computePosition(anchor: DOMRect, bubble: DOMRect, placement: TooltipProps['placement']): { top: number; left: number } {
	const vw = window.innerWidth
	const vh = window.innerHeight
	let top: number
	let left: number
	switch (placement) {
		case 'bottom':
			top = anchor.bottom + GAP
			left = anchor.left + anchor.width / 2 - bubble.width / 2
			break
		case 'left':
			top = anchor.top + anchor.height / 2 - bubble.height / 2
			left = anchor.left - GAP - bubble.width
			break
		case 'right':
			top = anchor.top + anchor.height / 2 - bubble.height / 2
			left = anchor.right + GAP
			break
		case 'top':
		default:
			top = anchor.top - GAP - bubble.height
			left = anchor.left + anchor.width / 2 - bubble.width / 2
			break
	}
	left = Math.max(VIEWPORT_MARGIN, Math.min(left, vw - bubble.width - VIEWPORT_MARGIN))
	top = Math.max(VIEWPORT_MARGIN, Math.min(top, vh - bubble.height - VIEWPORT_MARGIN))
	return { top, left }
}

function mergeHandler<E>(ours: (event: E) => void, theirs?: (event: E) => void) {
	return (event: E) => {
		ours(event)
		theirs?.(event)
	}
}

export function Tooltip({
	i18nKey,
	params,
	content,
	placement = 'top',
	showDelayMs = DEFAULT_SHOW_DELAY_MS,
	children,
}: TooltipProps) {
	const { t } = useTranslation()
	const resolved = i18nKey ? t(i18nKey, params) : content
	const label = typeof resolved === 'string' ? resolved : resolved != null ? String(resolved) : ''
	const tooltipId = useId()
	const anchorRef = useRef<HTMLElement | null>(null)
	const bubbleRef = useRef<HTMLSpanElement | null>(null)
	const showTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
	const isOverRef = useRef(false)
	const [visible, setVisible] = useState(false)
	/* Becomes true once the bubble has been measured and positioned — only then do we fade it in, so it
	   never flashes at the wrong spot. */
	const [positioned, setPositioned] = useState(false)
	const [anchorStyle, setAnchorStyle] = useState<CSSProperties>({})

	const clearShowTimer = useCallback(() => {
		if (showTimerRef.current != null) {
			clearTimeout(showTimerRef.current)
			showTimerRef.current = null
		}
	}, [])

	const hide = useCallback(
		(reason: string) => {
			clearShowTimer()
			setVisible(false)
			setPositioned(false)
			debugLog('hide', { reason, i18nKey })
		},
		[clearShowTimer, i18nKey],
	)

	const canShow = useCallback(() => {
		if (isTooltipGloballySuppressed()) {
			debugLog('blocked (global suppress)', { i18nKey })
			return false
		}
		return true
	}, [i18nKey])

	const showFromElement = useCallback(
		(element: HTMLElement, reason: string) => {
			if (!canShow()) return
			anchorRef.current = element
			setPositioned(false)
			setVisible(true)
			debugLog('show', { reason, i18nKey, label })
		},
		[canShow, i18nKey, label],
	)

	const scheduleShow = useCallback(
		(element: HTMLElement, reason: string) => {
			if (!canShow()) return
			anchorRef.current = element
			/* Already counting down for this hover — don't restart it (restarting on every mousemove was
			   why tooltips intermittently never appeared). */
			if (showTimerRef.current != null) return
			showTimerRef.current = setTimeout(() => {
				showTimerRef.current = null
				if (anchorRef.current === element && isOverRef.current && canShow()) {
					showFromElement(element, reason)
				}
			}, showDelayMs)
		},
		[canShow, showDelayMs, showFromElement],
	)

	const onPointerEnter = useCallback(
		(event: MouseEvent) => {
			if (isTooltipGloballySuppressed()) return
			if (event.buttons !== 0) return
			isOverRef.current = true
			scheduleShow(event.currentTarget as HTMLElement, 'enter')
			debugLog('enter', { i18nKey, type: event.type })
		},
		[i18nKey, scheduleShow],
	)

	const onPointerMove = useCallback(
		(event: MouseEvent) => {
			if (!isOverRef.current) return
			if (isTooltipGloballySuppressed()) {
				hide('global-suppress-move')
				return
			}
			/* CEP emits mousemove during click/drag with a button held — never a real hover. */
			if (event.buttons !== 0) {
				hide('buttons-down')
				return
			}
			if (!visible) scheduleShow(event.currentTarget as HTMLElement, 'move')
		},
		[hide, scheduleShow, visible],
	)

	const onPointerLeave = useCallback(
		(event: MouseEvent) => {
			isOverRef.current = false
			anchorRef.current = null
			debugLog('leave', { i18nKey, type: event.type })
			hide('pointer-leave')
		},
		[hide, i18nKey],
	)

	const onPointerDown = useCallback(
		(event: MouseEvent) => {
			suppressAllTooltips('target-pointerdown')
			hide('pointerdown')
			debugLog('pointerdown suppress', { i18nKey, type: event.type })
		},
		[hide, i18nKey],
	)

	const onClick = useCallback(() => {
		suppressAllTooltips('target-click')
		hide('click')
	}, [hide])

	const onFocus = useCallback(() => {
		suppressAllTooltips('target-focus')
		hide('focus')
		debugLog('focus suppress', { i18nKey })
	}, [hide, i18nKey])

	useEffect(() => {
		installGlobalTooltipSuppressListeners()
		return subscribeTooltipSuppress(() => {
			clearShowTimer()
			setVisible(false)
			setPositioned(false)
		})
	}, [clearShowTimer])

	useEffect(() => {
		return () => clearShowTimer()
	}, [clearShowTimer])

	/* Measure the rendered bubble, then position it clamped to the viewport (so it can't be clipped by
	   the panel edges). Runs after the bubble mounts and on scroll/resize while visible. */
	useLayoutEffect(() => {
		if (!visible) return
		const place = () => {
			const anchor = anchorRef.current
			const bubble = bubbleRef.current
			if (!anchor || !bubble) return
			const next = computePosition(anchor.getBoundingClientRect(), bubble.getBoundingClientRect(), placement)
			setAnchorStyle(next)
			setPositioned(true)
		}
		place()
		window.addEventListener('scroll', place, true)
		window.addEventListener('resize', place)
		return () => {
			window.removeEventListener('scroll', place, true)
			window.removeEventListener('resize', place)
		}
	}, [visible, placement, label])

	if (!label) {
		return <>{children}</>
	}

	const child = Children.only(children)
	if (!isValidElement(child)) {
		return <>{children}</>
	}

	const childEl = child as ReactElement<{
		onMouseEnter?: (event: MouseEvent) => void
		onMouseLeave?: (event: MouseEvent) => void
		onMouseMove?: (event: MouseEvent) => void
		onMouseDown?: (event: MouseEvent) => void
		onClick?: (event: MouseEvent) => void
		onFocus?: (event: FocusEvent) => void
		'aria-describedby'?: string
	}>

	const trigger = cloneElement(childEl, {
		'aria-describedby': visible ? tooltipId : undefined,
		onMouseEnter: mergeHandler(onPointerEnter, childEl.props.onMouseEnter),
		onMouseLeave: mergeHandler(onPointerLeave, childEl.props.onMouseLeave),
		onMouseMove: mergeHandler(onPointerMove, childEl.props.onMouseMove),
		onMouseDown: mergeHandler(onPointerDown, childEl.props.onMouseDown),
		onClick: mergeHandler(onClick, childEl.props.onClick),
		onFocus: mergeHandler(onFocus, childEl.props.onFocus),
	})

	const bubble =
		visible && typeof document !== 'undefined'
			? createPortal(
					<span
						id={tooltipId}
						ref={bubbleRef}
						className={`leap-tooltip__bubble${positioned ? ' is-visible' : ''}`}
						style={anchorStyle}
						role="tooltip"
					>
						{label}
					</span>,
					getPortalRoot(),
				)
			: null

	return (
		<>
			{trigger}
			{bubble}
		</>
	)
}
