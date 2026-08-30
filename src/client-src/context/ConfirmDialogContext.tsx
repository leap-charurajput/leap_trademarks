/**
 * ConfirmDialogProvider — themed confirm() and alert() for the panel.
 * Host calls may return `alertTitle` so errors use the same UI (not ScriptUI / toast).
 */
import {
	createContext,
	useCallback,
	useContext,
	useMemo,
	useRef,
	useState,
	type ReactNode,
} from 'react'
import { ConfirmationDialog, type ConfirmationDialogMode } from '../components/ConfirmationDialog'
import { ButtonVariant } from '../enums'

export interface ConfirmOptions {
	title?: string
	message: string
	confirmText?: string
	cancelText?: string
	confirmVariant?: ButtonVariant.Primary | ButtonVariant.Danger
}

export interface AlertOptions {
	title?: string
	message: string
	confirmText?: string
}

interface DialogState {
	mode: ConfirmationDialogMode
	title?: string
	message: string
	confirmText?: string
	cancelText?: string
	confirmVariant?: ButtonVariant.Primary | ButtonVariant.Danger
}

interface ConfirmDialogContextValue {
	confirm: (options: ConfirmOptions) => Promise<boolean>
	alert: (options: AlertOptions) => Promise<void>
}

const ConfirmDialogContext = createContext<ConfirmDialogContextValue | null>(null)

export function ConfirmDialogProvider({ children }: { children: ReactNode }) {
	const [dialog, setDialog] = useState<DialogState | null>(null)
	const resolveRef = useRef<((value: boolean) => void) | null>(null)

	const finish = useCallback((value: boolean) => {
		resolveRef.current?.(value)
		resolveRef.current = null
		setDialog(null)
	}, [])

	const confirm = useCallback((options: ConfirmOptions) => {
		return new Promise<boolean>((resolve) => {
			if (resolveRef.current) resolveRef.current(false)
			resolveRef.current = resolve
			setDialog({
				mode: 'confirm',
				title: options.title ?? 'Confirm',
				message: options.message,
				confirmText: options.confirmText ?? 'OK',
				cancelText: options.cancelText ?? 'Cancel',
				confirmVariant: options.confirmVariant ?? ButtonVariant.Danger,
			})
		})
	}, [])

	const alert = useCallback((options: AlertOptions) => {
		return new Promise<void>((resolve) => {
			if (resolveRef.current) resolveRef.current(false)
			resolveRef.current = () => {
				resolve()
			}
			setDialog({
				mode: 'alert',
				title: options.title ?? 'Alert',
				message: options.message,
				confirmText: options.confirmText ?? 'OK',
				confirmVariant: ButtonVariant.Primary,
			})
		})
	}, [])

	const value = useMemo(() => ({ confirm, alert }), [alert, confirm])

	return (
		<ConfirmDialogContext.Provider value={value}>
			{children}
			<ConfirmationDialog
				open={dialog != null}
				mode={dialog?.mode}
				title={dialog?.title}
				message={dialog?.message ?? ''}
				confirmText={dialog?.confirmText}
				cancelText={dialog?.cancelText}
				confirmVariant={dialog?.confirmVariant}
				onConfirm={() => finish(true)}
				onCancel={() => finish(false)}
			/>
		</ConfirmDialogContext.Provider>
	)
}

export function useConfirmDialog(): ConfirmDialogContextValue {
	const ctx = useContext(ConfirmDialogContext)
	if (!ctx) throw new Error('useConfirmDialog must be used within ConfirmDialogProvider')
	return ctx
}
