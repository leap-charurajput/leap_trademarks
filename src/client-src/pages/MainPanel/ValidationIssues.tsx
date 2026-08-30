/*
 * ValidationIssues — the issues report for the open logosheet (ported from LEAP Librarian's
 * `.issues-panel`). Errors and warnings each get a collapsible section; every issue that knows which
 * artwork caused it offers "Select object", which selects that artwork in Illustrator so the user can
 * fix it without hunting for it.
 *
 * Presentational + one action: it owns nothing but the "which row is selecting" state; the result it
 * renders is held by LogoSheetView, so re-validating simply replaces the prop.
 */
import { useState } from 'react'
import type { ValidationIssue, ValidationResult } from '@lib/host'
import { CollapsibleSection, IconButton } from '../../components'
import { Size, ToastType } from '../../enums'
import { useToast } from '../../context/ToastContext'
import { useTranslation } from '../../context/LocaleContext'
import controller from '../../controller'

export interface ValidationIssuesProps {
	result: ValidationResult
}

export function ValidationIssues({ result }: ValidationIssuesProps) {
	const { t } = useTranslation()
	const { notify } = useToast()
	/* Which row's "Select object" is in flight — keyed by row id so only that button disables. */
	const [selecting, setSelecting] = useState<string | null>(null)

	/* Ask the host to select the artwork behind an issue. A stale id (art deleted or regrouped since
	   the run) surfaces as a toast telling the user to validate again — not a silent no-op. */
	const selectItems = async (rowId: string, issue: ValidationIssue) => {
		if (selecting) return
		setSelecting(rowId)
		try {
			const r = await controller.runDocumentOp('selectItems', { ids: issue.itemIds })
			if (r.ok) notify(r.message ?? t('validate.selected'), ToastType.Success)
			else notify(r.error === 'pending' || r.error === 'No Illustrator session' ? t('validate.cepOnly') : (r.error ?? t('validate.selectFailed')), ToastType.Error)
		} finally {
			setSelecting(null)
		}
	}

	/* The crosshair is the row's only action, so it doubles as the "this issue has artwork" marker —
	   rows without an itemId simply have none. Its tooltip carries the wording the button used to. */
	const renderIssue = (issue: ValidationIssue, rowId: string) => {
		const many = issue.itemIds.length > 1
		return (
			<li key={rowId} className={`tm-issue tm-issue--${issue.severity}`}>
				<p className="tm-issue__message">{issue.message}</p>
				{issue.itemIds.length > 0 && (
					<IconButton
						label={many ? t('validate.selectObjects', { count: String(issue.itemIds.length) }) : t('validate.selectObject')}
						labelKey={many ? 'validate.selectObjects' : 'validate.selectObject'}
						labelParams={many ? { count: issue.itemIds.length } : undefined}
						size={Size.Small}
						className="tm-issue__select"
						disabled={selecting === rowId}
						onClick={() => void selectItems(rowId, issue)}
					>
						<span className="exp-icon exp-icon--sm exp-icon--target" aria-hidden />
					</IconButton>
				)}
			</li>
		)
	}

	if (result.errors.length === 0 && result.warnings.length === 0) {
		return (
			<p className="tm-issues__empty">{t('validate.clean')}</p>
		)
	}

	return (
		<div className="tm-issues">
			{result.errors.length > 0 && (
				<CollapsibleSection title={t('validate.errors', { count: String(result.errors.length) })} defaultOpen>
					<ul className="tm-issue-list">{result.errors.map((issue, i) => renderIssue(issue, `e${i}-${issue.code}`))}</ul>
				</CollapsibleSection>
			)}
			{result.warnings.length > 0 && (
				<CollapsibleSection title={t('validate.warnings', { count: String(result.warnings.length) })} defaultOpen={result.errors.length === 0}>
					<ul className="tm-issue-list">{result.warnings.map((issue, i) => renderIssue(issue, `w${i}-${issue.code}`))}</ul>
				</CollapsibleSection>
			)}
		</div>
	)
}
