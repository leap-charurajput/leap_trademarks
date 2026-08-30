/**
 * Telemetry — public surface for the panel. Direct-to-server (leap_log_server); no local JSON.
 *
 * The controller imports from here only:
 *   import { errInit, errLog, roiLogEvent, versionCheckInit } from '@lib/telemetry'
 *
 * Set the server host + secret in ./config.ts. See docs/TELEMETRY.md for the record shapes.
 */
export { PANEL, hasServer } from './config'
export { errInit, errLog } from './errlog'
export { roiLogEvent, roiLogTemplate, type RoiEvent } from './roi'
export { versionCheckInit } from './versioncheck'
export { flush } from './queue'
