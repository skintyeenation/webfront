// Approximate Skin Tyee Nation territory boundary, estimated from the GTC 601114
// scan — see docs/land/territory.md. [lat, lng] pairs. Replace with the official
// shapefile when available.
export const SKIN_TYEE_TERRITORY: [number, number][] = [
  [54.55, -127.10],
  [54.48, -126.55],
  [54.33, -125.75],
  [54.10, -124.80],
  [54.02, -123.98],
  [53.55, -124.30],
  [53.20, -125.20],
  [53.15, -126.30],
  [53.25, -127.10],
  [53.90, -127.25],
];

export const TERRITORY_CENTER: [number, number] = [53.85, -125.6];
export const TERRITORY_ZOOM = 7;

// Custom pins on the territory map. Placeholder locations — adjust lat/lng/label.
export interface TerritoryMarker {
  lat: number;
  lng: number;
  label: string;
}
export const TERRITORY_MARKERS: TerritoryMarker[] = [
  { lat: 53.93, lng: -125.95, label: 'Skin Tyee Band Office' },
  { lat: 54.04, lng: -125.6, label: 'Francois Lake' },
];
