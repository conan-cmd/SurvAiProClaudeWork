/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // Keep ffmpeg-static unbundled so its binary path stays valid
    serverComponentsExternalPackages: ["ffmpeg-static"],
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.blob.core.windows.net',
      },
      {
        protocol: 'https',
        hostname: '*.vercel-blob.com',
      },
    ],
  },
  typescript: {
    tsconfigPath: './tsconfig.json',
  },
}

// Sentry wraps the build for error monitoring. Without SENTRY_AUTH_TOKEN it
// skips source-map upload (errors still arrive, just minified) — add the token
// on Vercel later for readable stack traces.
const { withSentryConfig } = require("@sentry/nextjs/config")
module.exports = withSentryConfig(nextConfig, {
  silent: true,
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  disableLogger: true,
  widenClientFileUpload: false,
})
