/** @type {import('next').NextConfig} */
const nextConfig = {
  // Lab → Social renders posts in headless Chromium (lib/social/render.ts)
  serverExternalPackages: ['@sparticuz/chromium', 'playwright-core'],
  outputFileTracingIncludes: {
    '/api/social': [
      './social/code/post.html',
      './social/brand/**',
      './social/fonts/**',
      './social/system/**',
      './social/CLAUDE.md',
      './social/TO-CONFIRM.md',
      // Files these packages read at runtime that tracing can't see. Both the npm
      // layout and pnpm's (.pnpm/<pkg>@<version>/…, which Vercel uses) are listed.
      './node_modules/@sparticuz/chromium/bin/**',
      './node_modules/.pnpm/@sparticuz+chromium@*/node_modules/@sparticuz/chromium/**',
      './node_modules/playwright-core/browsers.json',
      './node_modules/playwright-core/package.json',
      './node_modules/.pnpm/playwright-core@*/node_modules/playwright-core/browsers.json',
      './node_modules/.pnpm/playwright-core@*/node_modules/playwright-core/package.json',
    ],
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
      },
      {
        protocol: 'https',
        hostname: '*.supabase.co',
      },
      {
        protocol: 'https',
        hostname: 'api.dicebear.com',
      },
    ],
  },
}

export default nextConfig
