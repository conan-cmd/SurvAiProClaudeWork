import * as Sentry from "@sentry/nextjs"

// Server + edge error monitoring. No DSN set (NEXT_PUBLIC_SENTRY_DSN) = fully
// disabled, so local/dev runs don't report anywhere.
export async function register() {
  if (!process.env.NEXT_PUBLIC_SENTRY_DSN) return
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    tracesSampleRate: 0.1,
    environment: process.env.VERCEL_ENV || "development",
  })
}

export const onRequestError = Sentry.captureRequestError
