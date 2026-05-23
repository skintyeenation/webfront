import React from 'react';
import { Provider } from 'react-redux';
import Application from 'lookup/Application';
import { store } from 'lookup/store';

export default function init() {
  return (
    <Provider store={store}>
      <Application />
    </Provider>
  );
}
