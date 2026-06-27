'use client';

import 'leaflet/dist/leaflet.css';
import { MapContainer, TileLayer, Polygon, Tooltip } from 'react-leaflet';
import { SKIN_TYEE_TERRITORY, TERRITORY_CENTER, TERRITORY_ZOOM } from '@/lib/territory';

// Interactive terrain map (free OpenTopoMap tiles — mountains/lakes/contours, no
// API key) with the Skin Tyee Nation territory polygon overlaid. Client-only
// (Leaflet needs the browser); loaded via next/dynamic ssr:false from PageHero.
export function TerritoryMap() {
  return (
    <MapContainer
      center={TERRITORY_CENTER}
      zoom={TERRITORY_ZOOM}
      scrollWheelZoom
      className="h-full w-full"
    >
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
