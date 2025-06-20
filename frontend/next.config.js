/** @type {import('next').NextConfig} */
const nextConfig = {
  // For static export to work with Vercel
  output: 'export',
  trailingSlash: true,
  images: {
    unoptimized: true
  }
}

module.exports = nextConfig