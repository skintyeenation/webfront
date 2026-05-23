import React, { useEffect, useRef } from 'react';
import { Platform, Text, View } from 'react-native';
import { theme } from 'lookup/styles';

export interface ReserveFeature {
  name: string;
  rings: number[][][]; // [lng, lat]
  centroid: [number, number]; // [lng, lat]
}

export interface ReserveMapProps {
  features: ReserveFeature[];
  bbox?: [number, number, number, number]; // [minLng, minLat, maxLng, maxLat]
  height?: number;
}

// Load Leaflet (CSS + JS) once via CDN. Keyless (OpenStreetMap tiles).
// Same pattern as the band app's LocationPicker.
let leafletPromise: Promise<any> | null = null;
function loadLeaflet(): Promise<any> {
  if (typeof window === 'undefined') return Promise.reject(new Error('no window'));
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

export default function ReserveMap({ features, bbox, height = 360 }: ReserveMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    let cancelled = false;
    void loadLeaflet().then((L) => {
      if (cancelled || !containerRef.current) return;
      // Recreate the map on every render so feature changes apply cleanly.
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
      const map = L.map(containerRef.current, { scrollWheelZoom: false }).setView([54, -123], 6);
      mapRef.current = map;
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 19,
      }).addTo(map);
      // Add each polygon + a centred marker per reserve.
      const group: any[] = [];
      for (const f of features) {
        const latlngs = f.rings.map((ring) => ring.map(([lng, lat]) => [lat, lng]));
        const poly = L.polygon(latlngs, {
          color: '#9ECD3B',
          weight: 2,
          fillColor: '#9ECD3B',
          fillOpacity: 0.25,
        }).addTo(map);
        poly.bindPopup(`<strong>${f.name}</strong>`);
        const [lng, lat] = f.centroid;
        const marker = L.marker([lat, lng]).addTo(map);
        marker.bindPopup(`<strong>${f.name}</strong>`);
        group.push(poly);
      }
      // Fit to bbox if we have one, else to the union of polygons.
      if (bbox && Number.isFinite(bbox[0])) {
        const [minLng, minLat, maxLng, maxLat] = bbox;
        map.fitBounds([
          [minLat, minLng],
          [maxLat, maxLng],
        ], { padding: [20, 20] });
      } else if (group.length) {
        const fg = L.featureGroup(group);
        map.fitBounds(fg.getBounds(), { padding: [20, 20] });
      }
    });
    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [features, bbox]);

  if (Platform.OS !== 'web') {
    return (
      <View style={{ padding: 12, borderColor: theme.colors.defaultBorder, borderWidth: 1 }}>
        <Text style={{ color: theme.colors.textDarker, fontSize: 12 }}>
          Interactive map is web-only for now. Open the per-reserve detail link to see coordinates.
        </Text>
      </View>
    );
  }
  return (
    <View
      style={{
        // @ts-ignore — RN-web maps to a DOM element; ref is on the inner div.
        height,
        backgroundColor: theme.colors.darkDefault,
        borderColor: theme.colors.defaultBorder,
        borderWidth: 1,
      }}
    >
      <div ref={containerRef as any} style={{ width: '100%', height: '100%' }} />
    </View>
  );
}
