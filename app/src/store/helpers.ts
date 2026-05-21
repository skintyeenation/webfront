// Copied from the ppt source — shared pending/fulfilled/rejected reducer helpers
// and the thunk-api accessor that injects the ApiService from middleware extra args.

export const reducePendingState = (reducer?: (state: any, action: any) => any) => (state: any, action: any) => {
  const pendingStateProperties = { ...state, loading: true, loaded: false };
  return reducer ? reducer(pendingStateProperties, action) : pendingStateProperties;
};

export const reduceRejectedState = (reducer?: (state: any, action: any) => any) => (state: any, action: any) => {
  const rejectedStateProperties = { ...state, loading: false, loaded: true };
  return reducer ? reducer(rejectedStateProperties, action) : rejectedStateProperties;
};

export const reduceFulfilledState = (reducer?: (state: any, action: any) => any) => (state: any, action: any) => {
  const fulfilledStateProperties = reducer
    ? { ...state, loading: false, loaded: true }
    : { ...state, ...action.payload, loading: false, loaded: true };
  return reducer ? reducer(fulfilledStateProperties, action) : fulfilledStateProperties;
};

export const thunkApiWithState = (thunkApi: any) => {
  const { getState, extra } = thunkApi;
  const { apiFactory } = extra;
  const rootState = getState();
  const api = apiFactory({ ...thunkApi, state: rootState });
  return { ...thunkApi, api, state: rootState };
};
