/** @type {import('next').NextConfig} */
const nextConfig = {
  // Allow <Image> from the headless WP media library (local dev + prod host).
  images: {
    remotePatterns: [
      { protocol: 'http', hostname: 'localhost', port: '8080' },
      { protocol: 'https', hostname: 'cms.skintyee.ca' },
    ],
  },
};

export default nextConfig;
