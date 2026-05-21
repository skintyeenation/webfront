import { ApiService } from 'skintyee/services/api/ApiService';
import { mockApiService } from 'skintyee/services/api/mock/MockApiService';
import Config from 'skintyee/config';

export type { ApiService };

/**
 * Selects which ApiService implementation the thunks use. Mirrors ppt's apiFactory
 * pattern (the factory is passed to thunks via redux-thunk's extra argument).
 *
 * STUB: only the mock implementation exists today. When the real Azure API is
 * built, branch on Config.apiServer here and return an HttpApiService. See STUBS.md.
 */
export const apiFactory = (_opts?: any): ApiService => {
  switch (Config.apiServer) {
    case 'mock':
    default:
      return mockApiService;
  }
};
