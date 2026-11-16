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
      './node_modules/@sparticuz/chromium/bin/**',
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
