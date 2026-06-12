'use client'

import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MapPin } from 'lucide-react';

interface RideMapProps {
  center?: [number, number];
  peers?: Record<string, any>;
  ownLocation?: [number, number];
  route?: any;
  destination?: [number, number] | null;
  onDestinationSelect?: (coords: [number, number]) => void;
  currentUser?: { uid: string; username: string };
}

export default function RideMap({ center = [77.209, 28.613], peers = {}, ownLocation, route, destination, onDestinationSelect, currentUser }: RideMapProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const markers = useRef<Record<string, L.Marker>>({});
  const ownMarker = useRef<L.Marker | null>(null);
  const routeLayer = useRef<L.Polyline | null>(null);
  const destMarker = useRef<L.Marker | null>(null);
  const isUserPanning = useRef(false);

  useEffect(() => {
    if (!mapContainer.current || map.current) return;

    // Initialize map
    map.current = L.map(mapContainer.current, {
      center: [center[1], center[0]], // Leaflet uses [lat, lng]
      zoom: 14,
      zoomControl: false,
      attributionControl: false
    });

    // Add Light/White Tiles (CartoDB Positron)
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      maxZoom: 20
    }).addTo(map.current);

    // Custom CSS for light map aesthetics
    const style = document.createElement('style');
    style.innerHTML = `
      .leaflet-container { background: #f9fafb !important; }
      .leaflet-tile { filter: contrast(1.05) saturate(1.2) !important; }
      .leaflet-control-zoom { border: none !important; margin: 20px !important; }
      .leaflet-control-zoom a { background: rgba(255,255,255,0.9) !important; color: #ea580c !important; border: 1px solid rgba(0,0,0,0.1) !important; backdrop-filter: blur(10px); }
      .custom-div-icon { background: transparent; border: none; }
    `;
    document.head.appendChild(style);

    // Track if user is manually interacting with the map
    map.current.on('dragstart', () => { isUserPanning.current = true; });
    map.current.on('zoomstart', () => { isUserPanning.current = true; });
    
    // Add click handler for destination selection
    map.current.on('click', (e: L.LeafletMouseEvent) => {
        if (onDestinationSelect) {
            onDestinationSelect([e.latlng.lng, e.latlng.lat]);
            // Reset panning so we fly to destination if needed, or just let it be
            isUserPanning.current = true;
        }
    });

    return () => {
      map.current?.remove();
      map.current = null;
    };
  }, []);

  // Update center
  useEffect(() => {
    if (!map.current || !center) return;
    
    // If the user has manually panned, don't automatically snap back unless they're extremely far
    // This allows free navigation
    const currentCenter = map.current.getCenter();
    const distance = currentCenter.distanceTo(L.latLng(center[1], center[0]));
    
    if (distance > 50000 || !isUserPanning.current) {
        map.current.flyTo([center[1], center[0]], 14, {
            duration: 1.5
        });
    }
  }, [center?.[0], center?.[1]]);

  // Update Destination Marker
  useEffect(() => {
    if (!map.current) return;
    
    if (!destination) {
        if (destMarker.current) {
            map.current.removeLayer(destMarker.current);
            destMarker.current = null;
        }
        return;
    }

    const icon = L.divIcon({
        className: 'custom-div-icon',
        html: `
          <div class="relative flex flex-col items-center justify-center -mt-8">
            <div class="absolute w-12 h-12 bg-orange-500/20 rounded-full animate-ping"></div>
            <div class="w-8 h-8 bg-neutral-900 border-2 border-orange-500 rounded-full flex items-center justify-center shadow-[0_0_20px_rgba(249,115,22,0.6)] z-10">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f97316" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
            </div>
            <div class="w-1 h-6 bg-gradient-to-b from-orange-500 to-transparent mt-1"></div>
            <div class="w-3 h-1 bg-black/50 rounded-full blur-[2px] mt-1"></div>
            <div class="absolute -top-6 bg-neutral-900/90 backdrop-blur-md border border-orange-500/30 px-2 py-0.5 rounded text-[8px] font-black text-orange-500 uppercase tracking-widest whitespace-nowrap shadow-xl">Target Locked</div>
          </div>
        `,
        iconSize: [32, 48],
        iconAnchor: [16, 48]
    });

    if (!destMarker.current) {
        destMarker.current = L.marker([destination[1], destination[0]], { icon }).addTo(map.current);
        // Fly to destination when placed
        map.current.flyTo([destination[1], destination[0]], 15, { duration: 1 });
        isUserPanning.current = true;
    } else {
        destMarker.current.setLatLng([destination[1], destination[0]]);
        map.current.flyTo([destination[1], destination[0]], 15, { duration: 1 });
        isUserPanning.current = true;
    }
  }, [destination]);

  // Update Route
  useEffect(() => {
    if (!map.current) return;

    if (routeLayer.current) {
        map.current.removeLayer(routeLayer.current);
    }

    if (route && route.coordinates) {
        const latLngs = route.coordinates.map((coord: [number, number]) => [coord[1], coord[0]]);
        routeLayer.current = L.polyline(latLngs, {
            color: '#ea580c',
            weight: 4,
            opacity: 0.8,
            lineJoin: 'round'
        }).addTo(map.current);
        
        // Add glow effect with a second wider line
        L.polyline(latLngs, {
            color: '#ea580c',
            weight: 12,
            opacity: 0.2,
            lineJoin: 'round'
        }).addTo(map.current);
    }
  }, [route]);

  // Update Own Marker
  useEffect(() => {
    if (!map.current || !ownLocation) return;

    const icon = L.divIcon({
      className: 'custom-div-icon',
      html: `
        <div class="relative flex flex-col items-center justify-center -mt-8">
          <div class="absolute w-16 h-16 bg-orange-600/20 rounded-full animate-ping"></div>
          <div class="w-10 h-10 bg-neutral-900 border-2 border-orange-500 rounded-full flex items-center justify-center shadow-[0_0_20px_rgba(249,115,22,0.6)] z-10 overflow-hidden">
              <img src="https://picsum.photos/seed/${currentUser?.uid || 'guest'}/100" class="w-full h-full object-cover" />
          </div>
          <div class="absolute -bottom-6 bg-neutral-900/90 backdrop-blur-md border border-orange-500/30 px-2 py-0.5 rounded text-[9px] font-black text-orange-500 uppercase tracking-widest whitespace-nowrap shadow-xl">
             ${currentUser?.username || 'ME'}
          </div>
        </div>
      `,
      iconSize: [40, 40],
      iconAnchor: [20, 20]
    });

    if (!ownMarker.current) {
      ownMarker.current = L.marker([ownLocation[1], ownLocation[0]], { icon }).addTo(map.current);
    } else {
      ownMarker.current.setIcon(icon);
      ownMarker.current.setLatLng([ownLocation[1], ownLocation[0]]);
    }
  }, [ownLocation, currentUser]);

  // Update Peer Markers
  useEffect(() => {
    if (!map.current) return;

    Object.entries(peers).forEach(([uid, data]) => {
      if (!data.location) return;

      const displayName = data.location?.username || `RIDER_${uid.substring(0, 4)}`;

      const icon = L.divIcon({
        className: 'custom-div-icon',
        html: `
            <div class="relative flex flex-col items-center justify-center -mt-8">
                <div class="absolute w-12 h-12 bg-white/5 rounded-full border border-white/10 animate-pulse"></div>
                <div class="w-8 h-8 bg-neutral-900 rounded-full border-2 border-orange-600 shadow-xl z-10 overflow-hidden">
                    <img src="https://picsum.photos/seed/${uid}/100" class="w-full h-full object-cover" />
                </div>
                <div class="absolute -bottom-5 bg-neutral-900/90 backdrop-blur-md border border-white/10 px-2 py-0.5 rounded text-[8px] font-black text-white uppercase tracking-widest whitespace-nowrap shadow-2xl">
                    ${displayName}
                </div>
            </div>
        `,
        iconSize: [32, 32],
        iconAnchor: [16, 16]
      });

      if (!markers.current[uid]) {
        markers.current[uid] = L.marker([data.location.lat, data.location.lng], { icon }).addTo(map.current!);
      } else {
        markers.current[uid].setIcon(icon);
        markers.current[uid].setLatLng([data.location.lat, data.location.lng]);
      }
    });

    // Cleanup stale markers
    Object.keys(markers.current).forEach(uid => {
        if (!peers[uid]) {
            map.current?.removeLayer(markers.current[uid]);
            delete markers.current[uid];
        }
    });
  }, [peers]);

  return (
    <div className="w-full h-full relative group">
        <div ref={mapContainer} className="w-full h-full z-0" />
        
        {/* Cinematic Overlays */}
        <div className="absolute inset-0 pointer-events-none shadow-[inset_0_0_100px_rgba(0,0,0,0.3)] z-10" />
        <div className="absolute inset-0 pointer-events-none bg-gradient-to-t from-neutral-950/60 via-transparent to-transparent z-10" />
        
        {/* HUD Grid Overlay */}
        <div className="absolute inset-0 pointer-events-none z-20 opacity-20" 
             style={{ backgroundImage: 'linear-gradient(#000 1px, transparent 1px), linear-gradient(90deg, #000 1px, transparent 1px)', backgroundSize: '80px 80px' }} 
        />
        
        {/* Status Badge */}
        <div className="absolute bottom-8 right-8 z-30 flex items-center gap-2 px-3 py-1 bg-neutral-900/80 backdrop-blur-md border border-white/5 rounded-full">
            <div className="w-1.5 h-1.5 bg-orange-600 rounded-full animate-pulse" />
            <span className="text-[8px] font-black text-white uppercase tracking-[0.2em]">Live Tactical Grid</span>
        </div>
    </div>
  );
}
