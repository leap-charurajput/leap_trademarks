/*
 * AddLogoSetMenu — the "+document" button + popover used by both the Teams and League tabs to add a set
 * of logos to the document. Four layouts: grid (with/without colour background) and one-logo-per-artboard
 * (with/without colour background). The caller's onPick runs the actual controller op for its logo list.
 */
import { useEffect, useRef, useState } from 'react'
import { IconButton, Tooltip } from '../../components'
import { Size } from '../../enums'
import { useTranslation } from '../../context/LocaleContext'

export interface AddLogoSetOptions {
	applyColor?: boolean
	perArtboard?: boolean
}

export function AddLogoSetMenu({ disabled, onPick }: { disabled?: boolean; onPick: (opts: AddLogoSetOptions) => void }) {
	const { t } = useTranslation()
	const [open, setOpen] = useState(false)
	const ref = useRef<HTMLSpanElement | null>(null)

	/* Close on outside click / Escape. */
	useEffect(() => {
		if (!open) return
		const onPointer = (e: MouseEvent) => {
			if (!ref.current?.contains(e.target as Node)) setOpen(false)
		}
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') setOpen(false)
		}
		document.addEventListener('mousedown', onPointer)
		document.addEventListener('keydown', onKey)
		return () => {
			document.removeEventListener('mousedown', onPointer)
			document.removeEventListener('keydown', onKey)
		}
	}, [open])

	const pick = (opts: AddLogoSetOptions) => {
		setOpen(false)
		onPick(opts)
	}

	return (
		<span className="tm-addset" ref={ref}>
			<Tooltip content={t('logoset.add')}>
				<IconButton label={t('logoset.add')} size={Size.Small} className="tm-iconbtn--bordered" disabled={disabled} onClick={() => setOpen((v) => !v)}>
					<span className="exp-icon exp-icon--sm exp-icon--add-document" aria-hidden />
				</IconButton>
			</Tooltip>
			{open && (
				<div className="tm-serverbar__menu tm-league-dlmenu">
					<button type="button" onClick={() => pick({})}>{t('logoset.addToDoc')}</button>
					<button type="button" onClick={() => pick({ applyColor: true })}>{t('logoset.addWithBg')}</button>
					<button type="button" onClick={() => pick({ perArtboard: true })}>{t('logoset.artboards')}</button>
					<button type="button" onClick={() => pick({ perArtboard: true, applyColor: true })}>{t('logoset.artboardsBg')}</button>
				</div>
			)}
		</span>
	)
}
