/** @type {import('next').NextConfig} */
const nextConfig = {
  // Compile the shared workspace packages (TS source) for this app.
  transpilePackages: ['@skintyee/api-client', '@skintyee/models', 'react-leaflet', '@react-leaflet/core'],
  // Allow <Image> from the headless WP media library (local dev + prod host).
  images: {
    remotePatterns: [
      { protocol: 'http', hostname: 'localhost', port: '8080' },
      { protocol: 'https', hostname: 'cms.skintyee.ca' },
    ],
  },
};

export default nextConfig;
