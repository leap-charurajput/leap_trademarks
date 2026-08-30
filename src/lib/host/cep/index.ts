/*
 * CEP host aggregate — wires the per-domain CEP implementations into a single Host object.
 * The UXP port adds a sibling `uxp/index.ts` exporting the same shape.
 */
import type { Host } from '../contracts'
import { documentHost } from './document'
import { logHost } from './log'
import { documentOpsHost } from './documentOps'
import { logosheetHost } from './logosheet'

export const cepHost: Host = {
	document: documentHost,
	log: logHost,
	documentOps: documentOpsHost,
	logosheet: logosheetHost,
}
