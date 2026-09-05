"use client";

import { useEffect } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Fix default marker icons broken by webpack asset hashing
const markerIcon = L.icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
});

// Smaller icon for the listing pin so it stands out from landmarks
const listingIcon = L.icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  className: "listing-marker",
});

type Props = {
  lat: number;
  lng: number;
  label: string;
  landmarks?: string[];
};

// Forces the map to invalidate its size after mount — fixes blank/grey tile issues
function MapResizer() {
  const map = useMap();
  useEffect(() => {
    const id = setTimeout(() => map.invalidateSize(), 100);
    return () => clearTimeout(id);
  }, [map]);
  return null;
}

export default function ListingMap({ lat, lng, label, landmarks = [] }: Props) {
  const osmUrl = `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=16/${lat}/${lng}`;

  return (
    <div className="relative w-full" style={{ height: "320px" }}>
      <MapContainer
        key={`${lat},${lng}`}
        center={[lat, lng]}
        zoom={15}
        style={{ height: "100%", width: "100%" }}
        scrollWheelZoom={false}
        zoomControl={true}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          maxZoom={19}
        />

        {/* Main listing pin */}
        <Marker position={[lat, lng]} icon={listingIcon}>
          <Popup>
            <strong>{label}</strong>
            <br />
            <a
              href={osmUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs underline"
            >
              Open in OpenStreetMap
            </a>
          </Popup>
        </Marker>

        <MapResizer />
      </MapContainer>

      {/* Open in OSM link — always visible, not just in popup */}
      <a
        href={osmUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="absolute bottom-2 left-2 z-[1000] bg-white/90 px-2 py-1 font-mono text-[10px] text-gray-700 hover:bg-white border border-gray-200"
      >
        Open in OpenStreetMap ↗
      </a>

      <p className="absolute bottom-2 right-2 z-[1000] bg-white/90 px-2 py-1 font-mono text-[10px] text-gray-500 border border-gray-200">
        © OpenStreetMap · Leaflet
      </p>
    </div>
  );
}
