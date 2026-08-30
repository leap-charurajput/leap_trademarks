/*
 * ManageServersModal — the "Manage Servers" subpanel. Lists configured Logobase folders with an
 * enable toggle, an open-folder action and a remove action, plus "Add Folder". All actions persist
 * through TrademarksContext → controller data settings. The native folder picker is CEP-only, so
 * "Add Folder" raises an info toast in the browser.
 */
import { Button, Checkbox, IconButton, Modal } from '../../components'
import { ButtonVariant, Size, ToastType } from '../../enums'
import { useTranslation } from '../../context/LocaleContext'
import { useToast } from '../../context/ToastContext'
import { useTrademarks } from '../../context/TrademarksContext'

export function ManageServersModal() {
	const { t } = useTranslation()
	const { notify } = useToast()
	const { manageServersOpen, setManageServersOpen, servers, addServerFolder, removeServer, toggleServer, openServerFolder } =
		useTrademarks()

	if (!manageServersOpen) return null

	const onAdd = () => {
		if (!addServerFolder()) notify(t('feature.pending', { feature: 'Add Folder (Illustrator only)' }), ToastType.Info)
	}

	return (
		<Modal
			open={manageServersOpen}
			title={t('flyout.manageServers')}
			width={340}
			onClose={() => setManageServersOpen(false)}
			footer={
				<div className="tm-modal-footer">
					<button type="button" className="tm-link" onClick={onAdd}>
						+ Add Folder
					</button>
					<Button variant={ButtonVariant.Secondary} size={Size.Small} onClick={() => setManageServersOpen(false)}>
						{t('action.close')}
					</Button>
				</div>
			}
		>
			{servers.length === 0 ? (
				<p className="tm-empty">No server folders. Use “Add Folder” to locate the Logobase data folder.</p>
			) : (
				<ul className="tm-servers">
					{servers.map((s) => (
						<li key={s.path} className={`tm-server-row ${s.active ? 'tm-server-row--active' : ''}`}>
							<Checkbox checked={s.enable} onChange={() => toggleServer(s.path)} label="" />
							<span className="tm-server-row__meta">
								<span className="tm-server-row__name">{s.name}</span>
								<span className="tm-server-row__path">{s.path}</span>
							</span>
							{!s.folderExists && <span className="exp-icon exp-icon--sm exp-icon--caution" aria-hidden title="Folder not found" />}
							<span className="tm-server-row__actions">
								<IconButton label="Open folder" size={Size.Small} onClick={() => openServerFolder(s.path)}>
									<span className="exp-icon exp-icon--sm exp-icon--folder" aria-hidden />
								</IconButton>
								<IconButton label="Remove" size={Size.Small} onClick={() => removeServer(s.path)}>
									<span className="exp-icon exp-icon--sm exp-icon--delete" aria-hidden />
								</IconButton>
							</span>
						</li>
					))}
				</ul>
			)}
		</Modal>
	)
}
