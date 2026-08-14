import React, { useState } from 'react'
import { useSelector, useDispatch } from 'react-redux'
import { Loader2 } from 'lucide-react'
import { loginWithGoogle } from '../features/login'
import { setUserdata } from '../redux/userSlice'
import CarePilotLogo from './CarePilotLogo'

function GoogleGlyph({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  )
}

function AuthGate({ children }) {
  const userData = useSelector((state) => state.user.userData)
  const dispatch = useDispatch()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const handleLogin = async () => {
    setLoading(true)
    setError(null)
    try {
      const user = await loginWithGoogle()
      dispatch(setUserdata(user))
    } catch (err) {
      console.log(err)
      const msg =
        err?.response?.data?.message ||
        err?.message ||
        'Sign-in failed. Please try again.'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  if (userData) return children

  return (
    <div
      className="auth-gate relative h-screen w-full overflow-hidden flex flex-col"
      style={{ fontFamily: 'var(--cf-font-ui)' }}
    >
      <div className="auth-gate-bg absolute inset-0" aria-hidden />
      <div className="auth-gate-grid absolute inset-0" aria-hidden />
      <div className="auth-gate-wash absolute inset-0" aria-hidden />

      <main className="relative z-10 flex-1 flex flex-col items-center justify-center px-6">
        <div className="auth-gate-panel w-full max-w-[420px] flex flex-col items-center text-center">
          <div className="auth-gate-logo mb-7">
            <CarePilotLogo size={72} className="rounded-[18px] shadow-sm" />
          </div>

          <h1 className="auth-gate-brand m-0 text-[var(--cf-ink)] tracking-tight font-semibold leading-none">
            CarePilot Ai
          </h1>
          <p className="mt-3 mb-0 text-[15px] text-[var(--cf-ink-faint)] leading-snug max-w-[280px]">
            Hospital command center · sign in to continue
          </p>

          <button
            type="button"
            onClick={handleLogin}
            disabled={loading}
            className="auth-gate-cta mt-9 w-full max-w-[320px] flex items-center justify-center gap-3 px-5 py-3.5 rounded-xl text-[14px] font-medium border border-[var(--cf-border-strong)] bg-white text-[var(--cf-ink)] cursor-pointer transition-all duration-150 disabled:opacity-60 hover:bg-[var(--cf-surface-sunken)] hover:border-[var(--cf-ink)] min-h-[48px]"
          >
            {loading ? (
              <Loader2 size={18} className="animate-spin text-[var(--cf-ink)]" />
            ) : (
              <GoogleGlyph />
            )}
            {loading ? 'Signing in…' : 'Continue with Google'}
          </button>

          {error && (
            <p
              className="mt-4 mb-0 text-[13px] text-[var(--cf-ink-soft)] max-w-sm leading-snug"
              role="alert"
            >
              {error}
            </p>
          )}
        </div>
      </main>

      <footer className="relative z-10 pb-6 px-6 text-center">
        <p className="m-0 text-[12px] text-[var(--cf-ink-faint)] tracking-wide">
          Authorized clinical staff only
        </p>
      </footer>

      <style>{`
        .auth-gate-bg {
          background:
            radial-gradient(1200px 600px at 50% -10%, #ffffff 0%, transparent 55%),
            radial-gradient(900px 500px at 80% 100%, #e8e8ea 0%, transparent 50%),
            radial-gradient(700px 420px at 10% 90%, #ececee 0%, transparent 45%),
            linear-gradient(180deg, #f7f7f8 0%, #efeff1 100%);
        }
        .auth-gate-grid {
          background-image:
            linear-gradient(rgba(10, 10, 11, 0.035) 1px, transparent 1px),
            linear-gradient(90deg, rgba(10, 10, 11, 0.035) 1px, transparent 1px);
          background-size: 48px 48px;
          mask-image: radial-gradient(ellipse 70% 60% at 50% 40%, #000 20%, transparent 75%);
        }
        .auth-gate-wash {
          background: radial-gradient(ellipse 50% 40% at 50% 42%, rgba(255,255,255,0.55), transparent 70%);
        }
        .auth-gate-brand {
          font-size: clamp(2.4rem, 6vw, 3.25rem);
          letter-spacing: -0.03em;
        }
        .auth-gate-logo {
          animation: auth-logo-in 700ms cubic-bezier(0.22, 1, 0.36, 1) both;
        }
        .auth-gate-panel > h1,
        .auth-gate-panel > p,
        .auth-gate-cta,
        .auth-gate-panel [role='alert'] {
          animation: auth-rise 720ms cubic-bezier(0.22, 1, 0.36, 1) both;
        }
        .auth-gate-panel > h1 { animation-delay: 80ms; }
        .auth-gate-panel > p { animation-delay: 140ms; }
        .auth-gate-cta { animation-delay: 220ms; }
        .auth-gate-panel [role='alert'] { animation-delay: 0ms; animation: none; }
        @keyframes auth-logo-in {
          from { opacity: 0; transform: translateY(10px) scale(0.94); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes auth-rise {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @media (prefers-reduced-motion: reduce) {
          .auth-gate-logo,
          .auth-gate-panel > h1,
          .auth-gate-panel > p,
          .auth-gate-cta {
            animation: none;
          }
        }
      `}</style>
    </div>
  )
}

export default AuthGate
