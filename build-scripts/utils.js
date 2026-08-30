import chalk from 'chalk'

export function log(val) {
	console.log(val)
}

export function log_error(val) {
	log_progress(val, 'red')
}

export function log_progress(val, color) {
	const c = color || 'yellow'
	console.log(chalk[c] ? chalk[c](val) : val)
}
