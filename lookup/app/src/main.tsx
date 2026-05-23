import React from 'react';
import { Platform } from 'react-native';
import { Provider } from 'react-redux';
import Application from 'lookup/Application';
import { store } from 'lookup/store';
import { theme } from 'lookup/styles';

// Web: paint html/body the same dark colour as the app so the area outside
// the centred (maxWidth 1100) content doesn't show through as bare white.
if (Platform.OS === 'web' && typeof document !== 'undefined') {
  const css = `
    html, body, #root { background-color: ${theme.colors.background}; color: ${theme.colors.text}; }
  `;
  const s = document.createElement('style');
  s.appendChild(document.createTextNode(css));
  document.head.appendChild(s);
}

export default function init() {
  return (
    <Provider store={store}>
      <Application />
    </Provider>
  );
}
