/*
 * LogoSheetView — shown when the open Illustrator document is a logosheet (legacy `#logoSheetParser`,
 * gated by the document-activate handler). "Validate logosheet" runs the host validator and lists every
 * issue it finds (ValidationIssues), each selectable in Illustrator. "Parse this logosheet" validates
 * first — exactly like LEAP Librarian — and refuses to parse a sheet with errors, otherwise it runs the
 * host parser (controller.parseLogosheet): every logo is exported to ai/png/svg, SLS_LOGO_<team>.json is
 * written, then the catalog reloads so the freshly-parsed logos appear. "Apply mark name to selection"
 * names the current selection ™/®.
 */
import { useState } from 'react'
import type { ValidationResult } from '@lib/host'
import { Button } from '../../components'
import { Size, ToastType } from '../../enums'
import { useToast } from '../../context/ToastContext'
import { useTranslation } from '../../context/LocaleContext'
import { useTrademarks } from '../../context/TrademarksContext'
import controller from '../../controller'
import { ValidationIssues } from './ValidationIssues'

export function LogoSheetView() {
	const { t } = useTranslation()
	const { notify } = useToast()
	const { logoSheetInfo, reload } = useTrademarks()
	const [parsing, setParsing] = useState(false)
	const [marking, setMarking] = useState(false)
	const [validating, setValidating] = useState(false)
	const [validation, setValidation] = useState<ValidationResult | null>(null)

	/* Apply ™/® mark name to the current Illustrator selection. */
	const applyMark = async () => {
		if (marking) return
		setMarking(true)
		try {
			const r = await controller.runDocumentOp('applyMark')
			if (r.ok) notify(r.message ?? t('logosheet.markDone'), ToastType.Success)
			else if (!r.error || r.error === 'pending' || r.error === 'No Illustrator session')
				notify(t('feature.pending', { feature: t('logosheet.applyMark') }), ToastType.Info)
			else notify(r.error, ToastType.Error)
		} finally {
			setMarking(false)
		}
	}

	/* Run the host validator and show its report. Returns the result so parse can reuse the same run
	   instead of validating the document twice. */
	const runValidation = async (): Promise<ValidationResult | null> => {
		const res = await controller.validateLogosheet()
		if (!res.ok || !res.result) {
			setValidation(null)
			notify(res.error ?? t('validate.failed'), ToastType.Error)
			return null
		}
		setValidation(res.result)
		return res.result
	}

	const validate = async () => {
		if (validating || parsing) return
		setValidating(true)
		try {
			const result = await runValidation()
			if (!result) return
			if (result.isValid && result.warnings.length === 0) notify(t('validate.clean'), ToastType.Success)
			else if (result.isValid) notify(t('validate.warningsOnly', { count: String(result.warnings.length) }), ToastType.Warning)
			else notify(t('validate.foundIssues', { count: String(result.errors.length) }), ToastType.Error)
		} finally {
			setValidating(false)
		}
	}

	const parse = async () => {
		if (parsing || validating) return
		setParsing(true)
		try {
			/* Validate first: a sheet with errors would parse into wrong or missing logo data. */
			const result = await runValidation()
			if (!result) return
			if (!result.isValid) {
				notify(t('validate.blockedParse', { count: String(result.errors.length) }), ToastType.Error)
				return
			}

			notify(t('logosheet.parsing'), ToastType.Info)
			const res = await controller.parseLogosheet(logoSheetInfo)
			if (res.ok) {
				notify(t('logosheet.parsed', { count: String(res.exportedCount) }), ToastType.Success)
				reload()
			} else {
				notify(t('logosheet.parseFailed', { error: res.error ?? '' }), ToastType.Error)
			}
		} catch (e) {
			notify(t('logosheet.parseFailed', { error: e instanceof Error ? e.message : String(e) }), ToastType.Error)
		} finally {
			setParsing(false)
		}
	}

	return (
		<div className="tm-logosheet">
			<p className="tm-hint">Logosheet detected: {logoSheetInfo}</p>
			<Button size={Size.Small} fullWidth disabled={validating || parsing} onClick={() => void validate()}>
				{validating ? t('validate.running') : t('validate.run')}
			</Button>
			<Button size={Size.Small} fullWidth disabled={parsing || validating} onClick={() => void parse()}>
				{parsing ? t('logosheet.parsing') : t('logosheet.parse', { info: logoSheetInfo })}
			</Button>
			<Button size={Size.Small} fullWidth disabled={marking} onClick={() => void applyMark()}>
				{marking ? t('logosheet.marking') : t('logosheet.applyMark')}
			</Button>
			{validation && <ValidationIssues result={validation} />}
		</div>
	)
}
