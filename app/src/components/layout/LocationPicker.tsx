import React, { useEffect, useRef } from 'react';
import { Platform, View } from 'react-native';
import { Text } from 'react-native-paper';
import Config from 'skintyee/config';
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

// Load the Google Maps JS API once (web only).
let mapsPromise: Promise<void> | null = null;
function loadGoogleMaps(key: string): Promise<void> {
  if (typeof window === 'undefined') return Promise.reject();
  if ((window as any).google?.maps) return Promise.resolve();
  if (!mapsPromise) {
    mapsPromise = new Promise<void>((resolve, reject) => {
      const s = document.createElement('script');
      s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}`;
      s.async = true;
      s.defer = true;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error('Failed to load Google Maps'));
      document.head.appendChild(s);
    });
  }
  return mapsPromise;
}

/**
 * Google Maps location picker with a draggable pin (web). Drag the marker (or
 * click the map) to set the meeting's coordinates. Native shows a fallback note.
 * The API key comes from Config.googleMapsApiKey (env). See STUBS.md.
 */
export function LocationPicker({ value, onChange, defaultCenter = { lat: 54.06, lng: -125.85 }, height = 240 }: LocationPickerProps) {
  const ref = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const key = Config.googleMapsApiKey;

  useEffect(() => {
    if (Platform.OS !== 'web' || !key || !ref.current) return;
    let cancelled = false;
    loadGoogleMaps(key)
      .then(() => {
        if (cancelled || !ref.current) return;
        const g = (window as any).google;
        const center = value ?? defaultCenter;
        const map = new g.maps.Map(ref.current, { center, zoom: 13, disableDefaultUI: true, zoomControl: true });
        const marker = new g.maps.Marker({ position: center, map, draggable: true });
        markerRef.current = marker;
        const update = (pos: any) => onChange({ lat: pos.lat(), lng: pos.lng() });
        marker.addListener('dragend', (e: any) => update(e.latLng));
        map.addListener('click', (e: any) => {
          marker.setPosition(e.latLng);
          update(e.latLng);
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  if (Platform.OS !== 'web') {
    return (
      <View style={{ padding: 12, backgroundColor: theme.colors.darkDefault, borderRadius: 4, marginBottom: 10 }}>
        <Text style={{ color: theme.colors.textDarker, fontSize: 12 }}>Map pin picker is available on web; on device it falls back to the location text above.</Text>
      </View>
    );
  }

  if (!key) {
    return (
      <View style={{ padding: 12, backgroundColor: theme.colors.darkDefault, borderRadius: 4, marginBottom: 10 }}>
        <Text style={{ color: theme.colors.textDarker, fontSize: 12 }}>
          Set GOOGLE_MAPS_API_KEY to enable the draggable map picker.
        </Text>
      </View>
    );
  }

  return (
    <View style={{ marginBottom: 10 }}>
      <Text style={{ color: theme.colors.textDarker, marginBottom: 6 }}>Drag the pin to set the location</Text>
      {React.createElement('div', { ref, style: { width: '100%', height, borderRadius: 4, overflow: 'hidden' } })}
      {value ? (
        <Text style={{ color: theme.colors.textDarker, fontSize: 11, marginTop: 4 }}>
          📍 {value.lat.toFixed(5)}, {value.lng.toFixed(5)}
        </Text>
      ) : null}
    </View>
  );
}
