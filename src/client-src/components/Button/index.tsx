/**
 * Button — primary interactive control. Adobe-panel styled via design tokens.
 */
import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { ButtonVariant, Size } from '../../enums'
import './style.css'

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type'> {
	variant?: ButtonVariant
	size?: Size
	fullWidth?: boolean
	type?: 'button' | 'submit' | 'reset'
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
	{ variant = ButtonVariant.Primary, size = Size.Medium, fullWidth = false, type = 'button', className = '', children, ...rest },
	ref,
) {
	const classes = [
		'leap-btn',
		`leap-btn--${variant}`,
		`leap-btn--${size}`,
		fullWidth ? 'leap-btn--full' : '',
		className,
	]
		.filter(Boolean)
		.join(' ')

	return (
		<button ref={ref} type={type} className={classes} {...rest}>
			{children}
		</button>
	)
})
