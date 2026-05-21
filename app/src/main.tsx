import React from 'react';
import { Platform } from 'react-native';
import { Provider } from 'react-redux';
import { store } from 'skintyee/store';
import App from 'skintyee/Application';

// Web only: hide scrollbars (desktop shows native ones from ScrollView/FlatList
// overflow) while keeping scroll behaviour. Injected once at startup.
if (Platform.OS === 'web' && typeof document !== 'undefined') {
  const style = document.createElement('style');
  style.textContent = `
    html, body, #root { height: 100%; margin: 0; }
    /* Hide scrollbars but keep scrolling (Firefox / IE) */
    * { scrollbar-width: none !important; -ms-overflow-style: none !important; }
    /* Hide scrollbars (WebKit / Blink: Chrome, Safari, Edge) */
    *::-webkit-scrollbar { width: 0 !important; height: 0 !important; display: none !important; }
  `;
  document.head.appendChild(style);
}

// Mirrors ppt: main wires the redux Provider around the Application.
export default function init() {
  return (
    <Provider store={store}>
      <App />
    </Provider>
  );
}
