import React, { useEffect, useRef, useState } from 'react';
import { Platform, View } from 'react-native';
import { ActivityIndicator, Button, HelperText, IconButton, Text, TextInput } from 'react-native-paper';
import { theme } from 'skintyee/styles';

export interface LatLng {
  lat: number;
  lng: number;
}

export interface LocationPickerProps {
  value?: LatLng;
  onChange: (coords: LatLng) => void;
  /** Clear the pin entirely (parent should drop coords from its state). */
  onClear?: () => void;
  // Default centre: Skin Tyee territory near Burns Lake, BC.
  defaultCenter?: LatLng;
  height?: number;
  /** Start with the map open. Defaults to false so the field stays compact. */
  defaultOpen?: boolean;
  /**
   * Optional address text. If provided, surfaces inside the map's
   * search input pre-filled, and changes propagate via onAddressChange.
   * Lets callers wire their own Location form field to the picker so
   * the two stay in sync — but it's optional; you can also use the
   * picker's search standalone.
   */
  address?: string;
  onAddressChange?: (next: string) => void;
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
 * OpenStreetMap). Drag the marker or click the map to set coordinates.
 *
 * Collapsed by default: shows either a "Set map pin" button (no value)
 * or a "📍 lat, lng" summary with Edit/Remove (has value). Tapping
 * "Edit on map" / "Set map pin" expands the map. Done collapses it.
 * Native shows a fallback note.
 */
export function LocationPicker({
  value,
  onChange,
  onClear,
  defaultCenter = { lat: 54.06, lng: -125.85 },
  height = 240,
  defaultOpen = false,
  address,
  onAddressChange,
}: LocationPickerProps) {
  const ref = useRef<any>(null);
  // Hold a ref to the map + marker so the geocode handler can drive
  // them without re-initialising. Kept outside React state — Leaflet
  // mutates these in place.
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const [open, setOpen] = useState(defaultOpen);
  // Internal search text — mirrors `address` when provided, otherwise
  // local-only. The geocoder uses this verbatim.
  const [search, setSearch] = useState<string>(address ?? '');
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | undefined>();

  // Keep the search box synced if the parent's address text changes
  // (e.g. user typing in a sibling Location field that we've wired up).
  useEffect(() => {
    if (address != null && address !== search) setSearch(address);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address]);

  // Geocode the current search text via Nominatim (OSM's free, keyless
  // search endpoint — same provider as the tiles). Picks the first
  // result, drops/moves the pin, recentres the map, and fires onChange
  // with the resolved coords. Nominatim asks for an identifying User-
  // Agent or Referer; browsers send the page Referer automatically.
  const geocode = async () => {
    if (!search.trim()) return;
    setSearchError(undefined);
    setSearching(true);
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(search.trim())}`;
      const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
      if (!res.ok) throw new Error(`Nominatim ${res.status}`);
      const hits = await res.json();
      const first = Array.isArray(hits) ? hits[0] : null;
      if (!first) {
        setSearchError(`Couldn't find "${search.trim()}".`);
        return;
      }
      const lat = parseFloat(first.lat);
      const lng = parseFloat(first.lon);
      if (isNaN(lat) || isNaN(lng)) {
        setSearchError('Geocoder returned an invalid result.');
        return;
      }
      if (mapRef.current && markerRef.current) {
        markerRef.current.setLatLng([lat, lng]);
        mapRef.current.setView([lat, lng], 15);
      }
      onChange({ lat, lng });
    } catch (e: any) {
      setSearchError(e?.message ?? 'Geocoding failed.');
    } finally {
      setSearching(false);
    }
  };

  // Re-init Leaflet whenever the map container mounts (open flipped to
  // true). On collapse, the cleanup tears down the existing map instance.
  useEffect(() => {
    if (Platform.OS !== 'web' || !open || !ref.current) return;
    let cancelled = false;
    let mapInstance: any = null;
    loadLeaflet()
      .then((L) => {
        if (cancelled || !ref.current) return;
        const start = value ?? defaultCenter;
        const map = L.map(ref.current).setView([start.lat, start.lng], 13);
        mapInstance = map;
        mapRef.current = map;
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
        markerRef.current = marker;
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
      if (mapInstance) {
        try { mapInstance.remove(); } catch { /* noop */ }
      }
      mapRef.current = null;
      markerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (Platform.OS !== 'web') {
    return (
      <View style={{ padding: 12, backgroundColor: theme.colors.darkDefault, borderRadius: 4, marginBottom: 10 }}>
        <Text style={{ color: theme.colors.textDarker, fontSize: 12 }}>
          Map pin picker is available on web; on device it falls back to the location text above.
        </Text>
      </View>
    );
  }

  // Collapsed view — compact summary + "Set/Edit pin" button. Keeps the
  // form short until the admin actually wants to place a pin.
  if (!open) {
    return (
      <View style={{ marginBottom: 10 }}>
        {value ? (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              backgroundColor: theme.colors.darkDefault,
              borderWidth: 1,
              borderColor: 'rgba(255,255,255,0.29)',
              borderRadius: 4,
              paddingHorizontal: 12,
              paddingVertical: 8,
            }}
          >
            <Text style={{ color: theme.colors.text, fontSize: 13, flex: 1 }}>
              📍 {value.lat.toFixed(5)}, {value.lng.toFixed(5)}
            </Text>
            <Button
              compact mode="text" icon="map-marker-radius"
              textColor={theme.colors.primary}
              onPress={() => setOpen(true)}
            >
              Edit on map
            </Button>
            {onClear ? (
              <IconButton
                icon="close" size={18}
                iconColor={theme.colors.textDarker}
                onPress={onClear}
                accessibilityLabel="Remove pin"
              />
            ) : null}
          </View>
        ) : (
          <Button
            mode="outlined" icon="map-marker-plus"
            textColor={theme.colors.text}
            onPress={() => setOpen(true)}
          >
            Set map pin
          </Button>
        )}
      </View>
    );
  }

  return (
    <View style={{ marginBottom: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
        <Text style={{ color: theme.colors.textDarker, flex: 1 }}>
          Search by address, or drag the pin to set the location
        </Text>
        <Button
          compact mode="text" icon="chevron-up"
          textColor={theme.colors.textDarker}
          onPress={() => setOpen(false)}
        >
          Hide map
        </Button>
      </View>

      {/* Address search — geocodes via Nominatim, drops the pin and
          recentres on the first hit. Submits on Enter or the Find btn. */}
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
        <TextInput
          dense mode="outlined"
          label="Address (optional)"
          value={search}
          onChangeText={(v) => { setSearch(v); onAddressChange?.(v); }}
          onSubmitEditing={geocode}
          returnKeyType="search"
          style={{ flex: 1, marginRight: 6 }}
          autoCapitalize="none"
        />
        <Button
          compact mode="contained" icon="map-search"
          buttonColor={theme.colors.primary} textColor="#000"
          onPress={geocode}
          disabled={!search.trim() || searching}
        >
          {searching ? '…' : 'Find'}
        </Button>
      </View>
      {searchError ? (
        <HelperText type="error" visible style={{ marginLeft: -8, marginTop: -4 }}>
          {searchError}
        </HelperText>
      ) : null}

      {React.createElement('div', {
        ref,
        style: { width: '100%', height, borderRadius: 4, overflow: 'hidden', zIndex: 0 },
      })}
      {value ? (
        <Text style={{ color: theme.colors.textDarker, fontSize: 11, marginTop: 4 }}>
          📍 {value.lat.toFixed(5)}, {value.lng.toFixed(5)}
        </Text>
      ) : null}
    </View>
  );
}
