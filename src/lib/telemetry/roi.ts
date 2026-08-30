/**
 * ROI logger — records one value-bearing user action per call by POSTing it straight to
 * leap_log_server (/roi-events). No local files. Fire-and-forget: on network failure the record is
 * held in the in-memory retry queue (see queue.ts). Never throws.
 *
 * Record shape matches the server's roi_events columns (and the dashboard's RoiEvent model).
 */
import { ENDPOINTS, PANEL, SCHEMA } from './config'
import { currentUsername, isoUtc, logobaseLabel, machineId } from './cepEnv'
import { postOrQueue, eid, SESSION_ID } from './queue'

/** A value-bearing action worth recording for ROI. */
export interface RoiEvent {
	action: string
	league?: string
	team?: string
	doc?: string
	artboards?: number | null
	elements?: Record<string, unknown>
	tmpl?: string
	extra?: Record<string, unknown>
}

/** Record one ROI event (POST to the server; queue on failure). Never throws. */
export function roiLogEvent(event: RoiEvent): void {
	try {
		if (!event?.action) return
		const record: Record<string, unknown> = {
			eid: eid(),
			v: SCHEMA,
			t: isoUtc(),
			lb: logobaseLabel(),
			u: currentUsername(),
			p: PANEL.code,
			pv: PANEL.version,
			a: event.action,
			lg: event.league || '',
			tc: event.team || '',
			doc: event.doc || '',
			m: machineId(),
		}
		if (event.artboards !== undefined && event.artboards !== null) record.n = event.artboards
		if (event.elements) record.el = event.elements
		if (event.tmpl) record.tmpl = event.tmpl
		// session id ties this action to the rest of the panel-open (stored in extra JSONB).
		record.extra = { sid: SESSION_ID, ...(event.extra || {}) }
		postOrQueue(ENDPOINTS.roiEvents, { events: [record] })
	} catch {
		/* logging must never break the panel */
	}
}

/** Record/refresh a template element record (POST to the server; upserted by uuid). Never throws. */
export function roiLogTemplate(id: string, elements: Record<string, unknown>, name?: string): void {
	try {
		if (!id) return
		const record: Record<string, unknown> = {
			v: SCHEMA,
			kind: 'template',
			t: isoUtc(),
			uuid: id,
			lb: logobaseLabel(),
			p: PANEL.code,
			pv: PANEL.version,
			el: elements || {},
		}
		if (name) record.name = name
		postOrQueue(ENDPOINTS.roiTemplates, { template: record })
	} catch {
		/* never throw */
	}
}
