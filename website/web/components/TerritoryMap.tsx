'use client';

import 'leaflet/dist/leaflet.css';
import { useEffect } from 'react';
import { MapContainer, TileLayer, Polygon, Tooltip, useMap } from 'react-leaflet';
import { SKIN_TYEE_TERRITORY, TERRITORY_CENTER, TERRITORY_ZOOM } from '@/lib/territory';

// Leaflet measures the container on init; if it isn't full-size yet the map
// renders as a thin slice. Force a re-measure once mounted + on resize.
function MapResizer() {
  const map = useMap();
  useEffect(() => {
    const fix = () => map.invalidateSize();
    fix();
    const t = setTimeout(fix, 250);
    window.addEventListener('resize', fix);
    return () => {
      clearTimeout(t);
      window.removeEventListener('resize', fix);
    };
  }, [map]);
  return null;
}

// Interactive terrain map (free OpenTopoMap tiles — mountains/lakes/contours, no
// API key) with the Skin Tyee Nation territory overlaid. Mouse-wheel zoom is OFF
// so it doesn't hijack the page; pan + zoom controls remain.
export function TerritoryMap() {
  return (
    <MapContainer
      center={TERRITORY_CENTER}
      zoom={TERRITORY_ZOOM}
      scrollWheelZoom={false}
      style={{ height: '100%', width: '100%' }}
    >
      <MapResizer />
      <TileLayer
        url="https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png"
        attribution='&copy; OpenStreetMap contributors, SRTM | &copy; OpenTopoMap (CC-BY-SA)'
        maxZoom={17}
      />
      <Polygon
        positions={SKIN_TYEE_TERRITORY}
        pathOptions={{ color: '#00B8EC', weight: 3, fillColor: '#00B8EC', fillOpacity: 0.12 }}
      >
        <Tooltip sticky>Skin Tyee Nation — traditional territory (approx.)</Tooltip>
      </Polygon>
    </MapContainer>
  );
}
