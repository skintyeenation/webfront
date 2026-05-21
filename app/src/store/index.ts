import { Middleware } from 'redux';
import { TypedUseSelectorHook, useDispatch, useSelector } from 'react-redux';
import { bindActionCreators, configureStore } from '@reduxjs/toolkit';
import thunk from 'redux-thunk';

import { apiFactory } from 'skintyee/store/apis';
import { rootReducer as reducer } from 'skintyee/store/reducers';
import { setError } from 'skintyee/store/modules/appState';

// Surfaces rejected thunks as app-level errors. Mirrors the ppt store middleware.
const errorMiddleware: Middleware = function errorReporter(store) {
  return function wrapDispatch(next) {
    return function handleAction(action: any) {
      if (action?.type?.includes?.('rejected')) {
        const msg = `${JSON.stringify(action, null, 2)}`;
        if (action.error) {
          action.error.name = 'Request was rejected';
          action.error.message = `Action [${action.type}] failed.\n${action.error.message}.\n\n${msg}`;
        }
        return store.dispatch(setError(action.error));
      }
      return next(action);
    };
  };
};

export const store = configureStore({
  reducer,
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: { warnAfter: 128 },
    })
      // apiFactory is injected so thunks can resolve the (currently mock) ApiService.
      .prepend(thunk.withExtraArgument({ apiFactory }))
      .concat(errorMiddleware),
});

export type RootState = ReturnType<typeof store.getState>;
// NOTE: `typeof store.dispatch` (not `ReturnType<...>`) so thunks are dispatchable.
// The ppt source has the ReturnType form, which is a latent bug masked by its
// looser typing; corrected here.
export type AppDispatch = typeof store.dispatch;
export const useAppDispatch = () => useDispatch<AppDispatch>();
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;
