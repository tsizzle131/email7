/** @type {import('next').NextConfig} */
const nextConfig = {
  // Remove static export for proper Vercel deployment with API routes
  images: {
    unoptimized: true
  }
}

module.exports = nextConfig