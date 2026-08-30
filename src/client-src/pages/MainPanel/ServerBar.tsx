/*
 * ServerBar — the footer "change server" bar (legacy `.changeServer`). Shows the current Logobase
 * server folder (clicking it opens the folder), and offers Choose… (a popover of enabled folders that
 * switches the active server + reloads) and Manage… (a modal).
 */
import { useEffect, useRef, useState } from 'react'
import { ToastType } from '../../enums'
import { useTranslation } from '../../context/LocaleContext'
import { useToast } from '../../context/ToastContext'
import { useTrademarks } from '../../context/TrademarksContext'
import { Tooltip } from '../../components'

export function ServerBar() {
	const { t } = useTranslation()
	const { notify } = useToast()
	const { servers, currentServer, changeServer, openServerFolder, setManageServersOpen } = useTrademarks()
	const [chooseOpen, setChooseOpen] = useState(false)
	const rightRef = useRef<HTMLDivElement | null>(null)

	const selectable = servers.filter((s) => s.enable && s.folderExists)

	/* Close the Choose… popover when clicking anywhere outside it (or pressing Escape). */
	useEffect(() => {
		if (!chooseOpen) return
		const onPointer = (e: MouseEvent) => {
			if (!rightRef.current?.contains(e.target as Node)) setChooseOpen(false)
		}
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') setChooseOpen(false)
		}
		document.addEventListener('mousedown', onPointer)
		document.addEventListener('keydown', onKey)
		return () => {
			document.removeEventListener('mousedown', onPointer)
			document.removeEventListener('keydown', onKey)
		}
	}, [chooseOpen])

	/* Open the current server folder in Finder/Explorer (no-op outside CEP → info toast). */
	const openCurrent = () => {
		if (currentServer && openServerFolder(currentServer.path) !== false) return
		notify(t('feature.pending', { feature: 'Open server folder' }), ToastType.Info)
	}

	return (
		<footer className="tm-serverbar">
			<div className="tm-serverbar__left">
				<span className="tm-serverbar__caption">{t('server.current')}</span>
				<Tooltip content={currentServer?.path ?? 'No server selected'}>
					<button type="button" className="tm-serverbar__name" onClick={openCurrent}>
						{currentServer?.name ?? '—'}
					</button>
				</Tooltip>
			</div>
			<div className="tm-serverbar__right" ref={rightRef}>
				<Tooltip content="Choose a server folder">
					<button type="button" className="tm-serverbar__btn" onClick={() => setChooseOpen((v) => !v)}>
						{t('action.choose')}
					</button>
				</Tooltip>
				<Tooltip content="Manage server folders">
					<button type="button" className="tm-serverbar__btn" onClick={() => setManageServersOpen(true)}>
						{t('action.manage')}
					</button>
				</Tooltip>
				{chooseOpen && (
					<div className="tm-serverbar__menu">
						{selectable.length === 0 ? (
							<span className="tm-serverbar__menu-empty">No server folders</span>
						) : (
							selectable.map((s) => (
								<button
									key={s.path}
									type="button"
									className={s.active ? 'is-active' : ''}
									onClick={() => {
										changeServer(s.path)
										setChooseOpen(false)
									}}
								>
									{s.name}
								</button>
							))
						)}
					</div>
				)}
			</div>
		</footer>
	)
}
