import * as Sentry from "@sentry/nextjs"

// Browser-side error monitoring — disabled when no DSN is configured.
if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    tracesSampleRate: 0.05,
    environment: process.env.NEXT_PUBLIC_VERCEL_ENV || "development",
  })
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart
