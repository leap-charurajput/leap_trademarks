/**
 * IconButton — square, icon-only action button with locale-aware tooltip.
 */
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { useTranslation } from '../../context/LocaleContext'
import type { TranslationKey, TranslationParams } from '../../i18n'
import { Size } from '../../enums'
import { Tooltip } from '../Tooltip'
import './style.css'

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type'> {
	/** Accessible label when labelKey is not set */
	label: string
	/** Locale key for aria-label and tooltip */
	labelKey?: TranslationKey
	labelParams?: TranslationParams
	tooltipKey?: TranslationKey
	tooltipParams?: TranslationParams
	size?: Size
	active?: boolean
	children: ReactNode
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
	{
		label,
		labelKey,
		labelParams,
		tooltipKey,
		tooltipParams,
		size = Size.Medium,
		active = false,
		className = '',
		children,
		...rest
	},
	ref,
) {
	const { t } = useTranslation()
	const resolvedLabel = labelKey ? t(labelKey, labelParams) : label
	const tipKey = tooltipKey ?? labelKey

	const classes = ['leap-icon-btn', `leap-icon-btn--${size}`, active ? 'leap-icon-btn--active' : '', className]
		.filter(Boolean)
		.join(' ')

	const button = (
		<button ref={ref} type="button" className={classes} aria-label={resolvedLabel} {...rest}>
			{children}
		</button>
	)

	if (tipKey) {
		return (
			<Tooltip i18nKey={tipKey} params={tooltipParams ?? labelParams}>
				{button}
			</Tooltip>
		)
	}

	return <Tooltip content={resolvedLabel}>{button}</Tooltip>
})
