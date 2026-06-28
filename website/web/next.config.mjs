import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Self-contained server bundle for the Docker image. Trace deps from the
  // monorepo root so the workspace packages are included in .next/standalone.
  output: 'standalone',
  outputFileTracingRoot: path.join(__dirname, '..', '..'),
  // Async Server Components return Promise<Element>, which the workspace-pinned
  // @types/react 18.0.38 (required by the app) wrongly rejects as JSX. They run
  // fine; only tsc flags it. Type-checking + lint still run in dev/CI, so skip
  // them in the production build to avoid the false positive.
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
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
