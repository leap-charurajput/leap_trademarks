/*
 * LoginView — the sign-in gate shown when REQUIRE_LOGIN is on and the user isn't authenticated. Mirrors
 * the legacy login screen: username + password → leapAuthService.login. A successful login broadcasts a
 * CEP event so the other LEAP panels sign in too (handled in AuthContext).
 */
import { useState } from 'react'
import { Button, PasswordField, TextField } from '../../components'
import { Size } from '../../enums'
import { LeapAuth } from '../../constants'
import { useAuth } from '../../context/AuthContext'
import { useTranslation } from '../../context/LocaleContext'
import './style.css'

export function LoginView() {
	const { t } = useTranslation()
	const { login, loading, error, clearError } = useAuth()
	const [username, setUsername] = useState('')
	const [password, setPassword] = useState('')
	/* Fall back to the Octane5 wordmark if the remote logo can't load (matches legacy onerror). */
	const [logoFailed, setLogoFailed] = useState(false)

	const canSubmit = username.trim() !== '' && password !== '' && !loading

	const submit = async () => {
		if (!canSubmit) return
		await login(username.trim(), password)
	}

	return (
		<div className="tm-login">
			<div className="tm-login__card">
				{/* BrandComply/Octane5 logo from the legacy login; falls back to a wordmark if it can't load. */}
				{logoFailed ? (
					<div className="tm-login__logo" aria-label="Octane5">
						octane<span className="tm-login__logo-mark">5</span>
					</div>
				) : (
					<img className="tm-login__logo-img" src={LeapAuth.LOGO_URL} alt="LEAP" onError={() => setLogoFailed(true)} />
				)}
				<p className="tm-login__title">{t('login.title')}</p>
				<p className="tm-login__subtitle">{t('login.subtitle')}</p>

				<form
					className="tm-login__form"
					onSubmit={(e) => {
						e.preventDefault()
						void submit()
					}}
				>
					<TextField
						label={t('login.username')}
						value={username}
						onChange={(v) => {
							if (error) clearError()
							setUsername(v)
						}}
						placeholder={t('login.usernamePlaceholder')}
						autoComplete="username"
						fullWidth
					/>
					<PasswordField
						label={t('login.password')}
						value={password}
						onChange={(v) => {
							if (error) clearError()
							setPassword(v)
						}}
						placeholder={t('login.passwordPlaceholder')}
						fullWidth
					/>

					{error && <p className="tm-login__error">{error}</p>}

					<Button type="submit" size={Size.Small} fullWidth disabled={!canSubmit}>
						{loading ? t('login.signingIn') : t('login.signIn')}
					</Button>
				</form>
			</div>
		</div>
	)
}
