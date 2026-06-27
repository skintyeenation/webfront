// @skintyee/api-client — the single API seam shared by the app and the website.
//
//   - ApiService            the typed contract (interface + DTOs)
//   - buildHttpApiService   real implementation against the NestJS api/ (/v1/*)
//   - mockApiService        in-memory mock (dev / SSR / fallback)
export * from './ApiService';
export { buildHttpApiService } from './HttpApiService';
export { mockApiService } from './MockApiService';
