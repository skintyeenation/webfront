import React, { useEffect, useRef } from 'react';
import { Platform, View } from 'react-native';
import { Text } from 'react-native-paper';
import { theme } from 'skintyee/styles';

export interface LatLng {
  lat: number;
  lng: number;
}

export interface LocationPickerProps {
  value?: LatLng;
  onChange: (coords: LatLng) => void;
  // Default centre: Skin Tyee territory near Burns Lake, BC.
  defaultCenter?: LatLng;
  height?: number;
}

// Load Leaflet (CSS + JS) from CDN once, on web. Keyless — uses OpenStreetMap
// tiles — so the draggable-pin map always renders without a Maps API key.
let leafletPromise: Promise<any> | null = null;
function loadLeaflet(): Promise<any> {
  if (typeof window === 'undefined') return Promise.reject();
  if ((window as any).L) return Promise.resolve((window as any).L);
  if (!leafletPromise) {
    leafletPromise = new Promise((resolve, reject) => {
      const css = document.createElement('link');
      css.rel = 'stylesheet';
      css.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(css);
      const js = document.createElement('script');
      js.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
      js.async = true;
      js.onload = () => resolve((window as any).L);
      js.onerror = () => reject(new Error('Failed to load Leaflet'));
      document.head.appendChild(js);
    });
  }
  return leafletPromise;
}

/**
 * Map location picker with a draggable pin (web, keyless via Leaflet +
 * OpenStreetMap). Drag the marker or click the map to set coordinates. Native
 * shows a fallback note. See app/STUBS.md.
 */
export function LocationPicker({ value, onChange, defaultCenter = { lat: 54.06, lng: -125.85 }, height = 240 }: LocationPickerProps) {
  const ref = useRef<any>(null);

  useEffect(() => {
    if (Platform.OS !== 'web' || !ref.current) return;
    let cancelled = false;
    loadLeaflet()
      .then((L) => {
        if (cancelled || !ref.current) return;
        const start = value ?? defaultCenter;
        const map = L.map(ref.current).setView([start.lat, start.lng], 13);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '© OpenStreetMap contributors',
          maxZoom: 19,
        }).addTo(map);
        const icon = L.icon({
          iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
          iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
          shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
          iconSize: [25, 41],
          iconAnchor: [12, 41],
        });
        const marker = L.marker([start.lat, start.lng], { draggable: true, icon }).addTo(map);
        const update = (ll: any) => onChange({ lat: ll.lat, lng: ll.lng });
        marker.on('dragend', () => update(marker.getLatLng()));
        map.on('click', (e: any) => {
          marker.setLatLng(e.latlng);
          update(e.latlng);
        });
        // Leaflet needs a size recalculation once the container has laid out.
        setTimeout(() => map.invalidateSize(), 100);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (Platform.OS !== 'web') {
    return (
      <View style={{ padding: 12, backgroundColor: theme.colors.darkDefault, borderRadius: 4, marginBottom: 10 }}>
        <Text style={{ color: theme.colors.textDarker, fontSize: 12 }}>Map pin picker is available on web; on device it falls back to the location text above.</Text>
      </View>
    );
  }

  return (
    <View style={{ marginBottom: 10 }}>
      <Text style={{ color: theme.colors.textDarker, marginBottom: 6 }}>Drag the pin to set the location</Text>
      {React.createElement('div', { ref, style: { width: '100%', height, borderRadius: 4, overflow: 'hidden', zIndex: 0 } })}
      {value ? (
        <Text style={{ color: theme.colors.textDarker, fontSize: 11, marginTop: 4 }}>
          📍 {value.lat.toFixed(5)}, {value.lng.toFixed(5)}
        </Text>
      ) : null}
    </View>
  );
}
