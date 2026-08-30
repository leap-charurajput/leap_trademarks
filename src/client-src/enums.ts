/*
 * Domain enums. Prefer these over magic strings everywhere (AGENTS.md §6). String enums are used
 * so values are stable, debuggable, and serialisable to the host.
 */

/* The four Adobe panel themes. The value is the <body> class that re-maps the CSS tokens. */
export enum Theme {
	Dark = 'theme-dark',
	Light = 'theme-light',
	MediumDark = 'theme-medium-dark',
	MediumLight = 'theme-medium-light',
}

/* Toast severity. */
export enum ToastType {
	Info = 'info',
	Success = 'success',
	Warning = 'warning',
	Error = 'error',
}

/* Shared visual size scale used by primitives. */
export enum Size {
	Small = 'small',
	Medium = 'medium',
	Large = 'large',
}

/* Button visual intent. */
export enum ButtonVariant {
	Primary = 'primary',
	Secondary = 'secondary',
	Danger = 'danger',
	Accent = 'accent',
}
