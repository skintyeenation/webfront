import React from 'react';
import { Provider } from 'react-redux';
import { store } from 'skintyee/store';
import App from 'skintyee/Application';

// Mirrors ppt: main wires the redux Provider around the Application.
export default function init() {
  return (
    <Provider store={store}>
      <App />
    </Provider>
  );
}
