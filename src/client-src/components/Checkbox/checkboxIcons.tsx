/** Checkbox SVG icons — matches leap_color_separator CheckedIcon / UncheckedIcon / IndeterminateIcon */

interface CheckboxIconProps {
	width?: number
	height?: number
	className?: string
}

export function CheckedIcon({ width = 16, height = 16, className = '' }: CheckboxIconProps) {
	return (
		<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 7.81 7.81" width={width} height={height} className={className}>
			<path
				fill="currentColor"
				d="M6.49,0H1.32C.59,0,0,.59,0,1.32v5.17c0,.73.59,1.32,1.32,1.32h5.17c.73,0,1.32-.59,1.32-1.32V1.32c0-.73-.59-1.32-1.32-1.32M3.41,6.42l-2.2-2.03.8-.86,1.27,1.18,2.45-2.99.92.75-3.25,3.96Z"
			/>
		</svg>
	)
}

export function UncheckedIcon({ width = 16, height = 16, className = '' }: CheckboxIconProps) {
	return (
		<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8.31 8.31" width={width} height={height} className={className}>
			<path
				fill="none"
				stroke="currentColor"
				strokeMiterlimit={10}
				strokeWidth={0.5}
				opacity={0.5}
				d="M6.74.25H1.57C.84.25.25.84.25,1.57v5.17c0,.73.59,1.32,1.32,1.32h5.17c.73,0,1.32-.59,1.32-1.32V1.57c0-.73-.59-1.32-1.32-1.32"
			/>
		</svg>
	)
}

export function IndeterminateIcon({ width = 16, height = 16, className = '' }: CheckboxIconProps) {
	return (
		<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 7.81 7.81" width={width} height={height} className={className}>
			<path
				fill="currentColor"
				d="M6.49,0H1.32C.59,0,0,.59,0,1.32v5.17c0,.73.59,1.32,1.32,1.32h5.17c.73,0,1.32-.59,1.32-1.32V1.32c0-.73-.59-1.32-1.32-1.32M5.5,4.39H2.31v-.97H5.5v.97Z"
			/>
		</svg>
	)
}
