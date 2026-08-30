/*
 * LogoImage — renders a logo thumbnail and resolves its source LAZILY, only once the cell scrolls
 * near the viewport (IntersectionObserver). This matters for the League grid, where there can be
 * hundreds of logos: inside Illustrator each logo is read from disk via the host, so reading them all
 * up front is slow. Deferring the read/load until a cell is about to be seen keeps the tab snappy.
 *
 * Over http(s) (browser dev / hosted) the resolved URL is used directly; inside Illustrator the
 * file:// path is read by the host into a data: URL (controller.readServerImage).
 */
import { useEffect, useRef, useState } from 'react'
import controller from '../../controller'

const TRANSPARENT = 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs='

/* True when the URL can be used by <img> directly (no host filesystem read needed). */
function isDirect(url: string): boolean {
	return url.indexOf('http://') === 0 || url.indexOf('https://') === 0 || url.indexOf('data:') === 0 || url.indexOf('file://') !== 0
}

export function LogoImage({ src, fallback, alt }: { src: string; fallback?: string; alt: string }) {
	const ref = useRef<HTMLImageElement | null>(null)
	const [seen, setSeen] = useState(false)
	const [resolved, setResolved] = useState<string | null>(null)
	/* Once the primary src (e.g. an SVG) fails to load, switch to the raster fallback for good. */
	const [useFallback, setUseFallback] = useState(false)

	/* The source we actually try: the raster fallback after a failure, else the preferred src. */
	const active = useFallback && fallback ? fallback : src

	/* Reset the fallback flag when the logo changes. */
	useEffect(() => {
		setUseFallback(false)
	}, [src, fallback])

	/* Mark the image as "seen" the first time it scrolls within ~one screen of the viewport. */
	useEffect(() => {
		if (seen) return
		const el = ref.current
		if (!el) return
		if (typeof IntersectionObserver === 'undefined') {
			setSeen(true)
			return
		}
		const io = new IntersectionObserver(
			(entries) => {
				if (entries.some((e) => e.isIntersecting)) {
					setSeen(true)
					io.disconnect()
				}
			},
			{ rootMargin: '300px' },
		)
		io.observe(el)
		return () => io.disconnect()
	}, [seen])

	/* Once seen, resolve the active source (direct URL in the browser; host read inside Illustrator).
	   Inside Illustrator a missing SVG read returns '' — we then resolve the raster fallback instead. */
	useEffect(() => {
		if (!seen) return
		if (isDirect(active)) {
			setResolved(active)
			return
		}
		let alive = true
		setResolved(null)
		void controller.readServerImage(active).then((s) => {
			if (!alive) return
			if (s) {
				setResolved(s)
			} else if (fallback && active !== fallback) {
				void controller.readServerImage(fallback).then((f) => {
					if (alive) setResolved(f || TRANSPARENT)
				})
			} else {
				setResolved(TRANSPARENT)
			}
		})
		return () => {
			alive = false
		}
	}, [seen, active, fallback])

	/* Browser/raster failure (e.g. an SVG http 404 in dev) — switch to the fallback once. */
	const onError = () => {
		if (!useFallback && fallback && fallback !== src) setUseFallback(true)
	}

	return <img ref={ref} className="tm-logo__img" src={resolved ?? TRANSPARENT} alt={alt} loading="lazy" onError={onError} />
}
