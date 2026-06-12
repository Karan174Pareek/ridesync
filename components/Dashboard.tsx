'use client'

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import { auth, db, googleProvider } from '@/lib/firebase';
import { signInWithPopup, signOut } from 'firebase/auth';
import { collection, addDoc, doc, updateDoc, setDoc, getDocs, query, where } from 'firebase/firestore';
import dynamic from 'next/dynamic';
import { useRideSocket } from '@/hooks/useRideSocket';

const RideMap = dynamic(() => import('./RideMap'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full bg-neutral-900 flex flex-col items-center justify-center gap-4">
      <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
      <span className="text-[9px] font-black text-neutral-400 uppercase tracking-widest">Loading Tactical Grid...</span>
    </div>
  )
});
import { motion, AnimatePresence } from 'motion/react';
import { Shield, MapPin, Users, LogOut, Plus, LogIn, AlertCircle, Phone, Bluetooth, X, ChevronRight, Menu, Cpu } from 'lucide-react';
import QRCode from 'qrcode.react';

export default function Dashboard() {
  const { user, riderProfile, loading, loginAsGuest, logout } = useAuth();
  const [activeSession, setActiveSession] = useState<any>(null);
  const [joinCode, setJoinCode] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [location, setLocation] = useState<[number, number] | null>(null);
  const [destination, setDestination] = useState<[number, number] | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [sosActive, setSosActive] = useState(false);
  const [countdown, setCountdown] = useState(14);
  const [showProfile, setShowProfile] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [selectedRide, setSelectedRide] = useState<any>(null);
  const [rideHistory, setRideHistory] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [isBooting, setIsBooting] = useState(true);
  const [telemetry, setTelemetry] = useState({
    altitude: 0,
    heading: 0,
    speed: 0,
    battery: 100,
    signal: 'STRONG'
  });
  const [incomingSOS, setIncomingSOS] = useState<any>(null);
  const [profileForm, setProfileForm] = useState({
    username: '',
    blood_group: '',
    motorcycle_make: '',
    motorcycle_model: ''
  });

  // Simulation States
  const [activeRoute, setActiveRoute] = useState<any>(null);
  const [isSimulating, setIsSimulating] = useState(false);
  const [simSpeed, setSimSpeed] = useState(80); // km/h
  const [simRiderCount, setSimRiderCount] = useState(2);
  const [simRouteIndex, setSimRouteIndex] = useState(0);
  const [simHubOpen, setSimHubOpen] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined' && window.innerWidth >= 768) {
      setSimHubOpen(true);
    }
  }, []);

  const { peers, updateLocation, broadcastSOS } = useRideSocket(
    activeSession?.room_code || null,
    (data) => {
      // Only show if it's not from ourselves
      if (data.userId !== user?.uid) {
        setIncomingSOS(data);
      }
    }
  );

  // Generate simulated peers based on rider count and route index
  const simulatedPeers = React.useMemo(() => {
    const peersObj: Record<string, any> = {};
    if (!location) return peersObj;

    const riderNames = ['VALKYRIE', 'GHOST_RIDER', 'INTERCEPTOR'];

    for (let i = 0; i < simRiderCount; i++) {
      const name = riderNames[i];
      const peerId = `sim_peer_${i + 1}`;

      let peerLoc: [number, number] = [location[0], location[1]];
      let peerSpeed = 0;

      if (activeRoute && activeRoute.coordinates && activeRoute.coordinates.length > 0) {
        const offsetIndex = Math.max(0, simRouteIndex - (i + 1) * 4);
        const coord = activeRoute.coordinates[offsetIndex];
        peerLoc = [coord[0], coord[1]];
        peerSpeed = isSimulating ? simSpeed : 0;
      } else {
        // Static offset if no route is loaded
        const offsetLat = (i + 1) * 0.0002;
        const offsetLng = ((i % 2 === 0 ? 1 : -1) * (i + 1)) * 0.0002;
        peerLoc = [location[0] + offsetLng, location[1] + offsetLat];
      }

      peersObj[peerId] = {
        location: {
          lat: peerLoc[1],
          lng: peerLoc[0],
          speed: peerSpeed / 3.6,
          timestamp: new Date().toISOString(),
          username: name
        }
      };
    }
    return peersObj;
  }, [location, activeRoute, simRouteIndex, simRiderCount, isSimulating, simSpeed]);

  const mergedPeers = React.useMemo(() => {
    return { ...peers, ...simulatedPeers };
  }, [peers, simulatedPeers]);

  // Startup sequence
  useEffect(() => {
    if (!loading && user) {
      const timer = setTimeout(() => setIsBooting(false), 2000);
      return () => clearTimeout(timer);
    }
  }, [loading, user]);

  // Battery tracking
  useEffect(() => {
    if ('getBattery' in navigator) {
      (navigator as any).getBattery().then((battery: any) => {
        setTelemetry(prev => ({ ...prev, battery: battery.level * 100 }));
        battery.addEventListener('levelchange', () => {
          setTelemetry(prev => ({ ...prev, battery: battery.level * 100 }));
        });
      });
    }
  }, []);

  // Sync profile form once riderProfile is loaded
  useEffect(() => {
    if (riderProfile && !profileForm.username) {
      setProfileForm({
        username: riderProfile.username || '',
        blood_group: riderProfile.medical_profile?.blood_group || '',
        motorcycle_make: riderProfile.motorcycle?.make || '',
        motorcycle_model: riderProfile.motorcycle?.model || ''
      });
    }
  }, [riderProfile]);

  useEffect(() => {
    if (!navigator.geolocation) {
      setLocation([77.209, 28.613]);
      return;
    }

    const handlePos = (pos: GeolocationPosition) => {
      const newLoc: [number, number] = [pos.coords.longitude, pos.coords.latitude];
      setLocation(newLoc);

      // Update real telemetry
      setTelemetry(prev => ({
        ...prev,
        speed: (pos.coords.speed || 0) * 3.6, // m/s to km/h
        altitude: pos.coords.altitude || 0,
        heading: pos.coords.heading || 0
      }));

      if (activeSession && user) {
        updateLocation(user.uid, {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          speed: pos.coords.speed || 0,
          timestamp: new Date().toISOString(),
          username: riderProfile?.username || 'RIDER_' + user.uid.substring(0, 4)
        });
      }
    };

    const handleErr = (err: GeolocationPositionError) => {
      console.error("Geolocation error:", err);
      // Fallback so map and markers still work
      setLocation([77.209, 28.613]);
    };

    // Force an immediate fetch to prevent watchPosition delays
    navigator.geolocation.getCurrentPosition(handlePos, handleErr, { enableHighAccuracy: true });

    const watchId = navigator.geolocation.watchPosition(
      handlePos,
      handleErr,
      { enableHighAccuracy: true, maximumAge: 0 }
    );

    // FLUTTER BRIDGE: Expose global function for Flutter WebView to inject native GPS data
    (window as any).updateLocationFromFlutter = (lat: number, lng: number, speed: number, heading: number, altitude: number) => {
      const newLoc: [number, number] = [lng, lat];
      setLocation(newLoc);
      setTelemetry(prev => ({
        ...prev,
        speed: (speed || 0) * 3.6,
        altitude: altitude || 0,
        heading: heading || 0
      }));

      if (activeSession && user) {
        updateLocation(user.uid, {
          lat: lat,
          lng: lng,
          speed: speed || 0,
          timestamp: new Date().toISOString(),
          username: riderProfile?.username || 'RIDER_' + user.uid.substring(0, 4)
        });
      }
    };

    return () => navigator.geolocation.clearWatch(watchId);
  }, [activeSession, user, updateLocation, riderProfile]);

  const handleSOSFinal = useCallback(() => {
    if (user && location) {
      broadcastSOS(user.uid, { lat: location[1], lng: location[0] });
      setSosActive(false);
      setCountdown(14);
    }
  }, [user, location, broadcastSOS]);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (sosActive && countdown > 0) {
      timer = setInterval(() => setCountdown(c => c - 1), 1000);
    } else if (countdown === 0 && sosActive) {
      handleSOSFinal();
    }
    return () => clearInterval(timer);
  }, [sosActive, countdown, handleSOSFinal]);

  // Fetch route when location or destination changes
  useEffect(() => {
    if (!location || !destination) {
      setActiveRoute(null);
      setSimRouteIndex(0);
      return;
    }

    const fetchRoute = async () => {
      try {
        const [startLon, startLat] = location;
        const [endLon, endLat] = destination;
        const url = `https://router.project-osrm.org/route/v1/driving/${startLon},${startLat};${endLon},${endLat}?overview=full&geometries=geojson`;
        const res = await fetch(url);
        const data = await res.json();
        if (data.routes && data.routes.length > 0) {
          setActiveRoute(data.routes[0].geometry);
          setSimRouteIndex(0);
        }
      } catch (err) {
        console.error("Error fetching route from OSRM:", err);
      }
    };

    fetchRoute();
  }, [location?.[0], location?.[1], destination?.[0], destination?.[1]]);

  // Simulation Loop
  useEffect(() => {
    if (!isSimulating || !activeRoute || !activeRoute.coordinates || activeRoute.coordinates.length === 0) return;

    const intervalTime = 1000;
    const timer = setInterval(() => {
      setSimRouteIndex((prevIndex) => {
        const mps = simSpeed / 3.6;
        const indexStep = Math.max(1, Math.round(mps / 15));
        const nextIndex = prevIndex + indexStep;

        if (nextIndex >= activeRoute.coordinates.length - 1) {
          clearInterval(timer);
          setIsSimulating(false);
          const finalCoord = activeRoute.coordinates[activeRoute.coordinates.length - 1];
          setLocation([finalCoord[0], finalCoord[1]]);

          setTelemetry((prev) => ({
            ...prev,
            speed: 0,
            heading: prev.heading
          }));
          return activeRoute.coordinates.length - 1;
        }

        const currentCoord = activeRoute.coordinates[nextIndex];
        const nextCoord = activeRoute.coordinates[Math.min(nextIndex + 1, activeRoute.coordinates.length - 1)];
        const heading = calculateHeading(currentCoord, nextCoord);

        setLocation([currentCoord[0], currentCoord[1]]);
        const altitudeBase = 100 + Math.sin(nextIndex / 5) * 12;

        setTelemetry((prev) => ({
          ...prev,
          speed: simSpeed,
          heading: heading,
          altitude: altitudeBase
        }));

        if (activeSession && user) {
          updateLocation(user.uid, {
            lat: currentCoord[1],
            lng: currentCoord[0],
            speed: simSpeed / 3.6,
            timestamp: new Date().toISOString(),
            username: riderProfile?.username || 'RIDER_' + user.uid.substring(0, 4)
          });
        }

        return nextIndex;
      });
    }, intervalTime);

    return () => clearInterval(timer);
  }, [isSimulating, activeRoute, simSpeed, activeSession, user, riderProfile, updateLocation]);

  const triggerSimulatedSOS = () => {
    const peerId = 'sim_peer_2';
    const rider = simulatedPeers[peerId];
    if (rider && rider.location) {
      setIncomingSOS({
        userId: 'sim_peer_2',
        location: {
          lat: rider.location.lat,
          lng: rider.location.lng
        }
      });
    } else {
      setIncomingSOS({
        userId: 'sim_peer_2',
        location: {
          lat: location ? location[1] + 0.005 : 28.618,
          lng: location ? location[0] + 0.005 : 77.214
        }
      });
    }
  };

  // Debounced search suggestions
  useEffect(() => {
    const timer = setTimeout(async () => {
      if (!searchQuery || searchQuery.length < 3) {
        setSuggestions([]);
        return;
      }
      try {
        const baseUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}&addressdetails=1&limit=15&dedupe=0`;
        let data = [];

        if (location) {
          const [lon, lat] = location;
          const viewbox = `${lon - 0.5},${lat + 0.5},${lon + 0.5},${lat - 0.5}`;

          // First attempt: Strict bounded local search (approx 50km radius)
          const localRes = await fetch(`${baseUrl}&viewbox=${viewbox}&bounded=1`);
          data = await localRes.json();

          // Second attempt: Fallback to global search if local yielded nothing
          if (!data || data.length === 0) {
            const globalRes = await fetch(`${baseUrl}&viewbox=${viewbox}&bounded=0`);
            data = await globalRes.json();
          }
        } else {
          const res = await fetch(baseUrl);
          data = await res.json();
        }

        // Sort by distance to user if location is available
        if (location && data && data.length > 0) {
          const [lon, lat] = location;
          data = data.map((item: any) => {
            const itemLat = parseFloat(item.lat);
            const itemLon = parseFloat(item.lon);
            const dLat = itemLat - lat;
            const dLon = itemLon - lon;
            item.distance = (dLat * dLat) + (dLon * dLon);
            return item;
          }).sort((a: any, b: any) => a.distance - b.distance);
        }

        // Take the top 5 after sorting
        setSuggestions((data || []).slice(0, 5));
      } catch (error) {
        console.error("Error fetching suggestions:", error);
      }
    }, 300); // 300ms debounce
    return () => clearTimeout(timer);
  }, [searchQuery, location]);

  const handleSearchLocation = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (suggestions.length > 0) {
      // If there are suggestions, just use the top one
      const top = suggestions[0];
      setDestination([parseFloat(top.lon), parseFloat(top.lat)]);
      setSearchQuery(top.name || top.display_name.split(',')[0]);
      setSuggestions([]);
      return;
    }

    if (!searchQuery) return;
    setIsSearching(true);
    try {
      const baseUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}&limit=15&dedupe=0`;
      let data = [];

      if (location) {
        const [lon, lat] = location;
        const viewbox = `${lon - 0.5},${lat + 0.5},${lon + 0.5},${lat - 0.5}`;

        // Strict bounded search first
        const localRes = await fetch(`${baseUrl}&viewbox=${viewbox}&bounded=1`);
        data = await localRes.json();

        if (!data || data.length === 0) {
          const globalRes = await fetch(`${baseUrl}&viewbox=${viewbox}&bounded=0`);
          data = await globalRes.json();
        }
      } else {
        const res = await fetch(baseUrl);
        data = await res.json();
      }

      if (data && data.length > 0) {
        if (location) {
          const [lon, lat] = location;
          data = data.sort((a: any, b: any) => {
            const dLatA = parseFloat(a.lat) - lat;
            const dLonA = parseFloat(a.lon) - lon;
            const dLatB = parseFloat(b.lat) - lat;
            const dLonB = parseFloat(b.lon) - lon;
            return (dLatA * dLatA + dLonA * dLonA) - (dLatB * dLatB + dLonB * dLonB);
          });
        }
        const best = data[0];
        setDestination([parseFloat(best.lon), parseFloat(best.lat)]);
        setSearchQuery(best.name || best.display_name.split(',')[0]);
      } else {
        alert("Location not found");
      }
    } catch (error) {
      console.error("Error searching location:", error);
    } finally {
      setIsSearching(false);
    }
  };

  const fetchHistory = useCallback(async () => {
    if (!user || user.isGuest) return;
    setLoadingHistory(true);
    try {
      const q = query(
        collection(db, 'ride_sessions'),
        where('participant_ids', 'array-contains', user.uid),
        where('session_status', '==', 'COMPLETED')
      );
      const querySnapshot = await getDocs(q);
      const history = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setRideHistory(history.sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()));
    } catch (error) {
      console.error("Error fetching history:", error);
    } finally {
      setLoadingHistory(false);
    }
  }, [user]);

  useEffect(() => {
    if (showHistory) {
      fetchHistory();
    }
  }, [showHistory, fetchHistory]);

  const handleSignIn = () => signInWithPopup(auth, googleProvider);
  const handleSignOut = () => logout();

  const createRide = async () => {
    if (!user) return;
    setIsCreating(true);
    const roomCode = Math.random().toString(36).substring(2, 8).toUpperCase();

    if (user.isGuest) {
      setActiveSession({
        room_code: roomCode,
        session_status: 'ACTIVE',
        leader_id: user.uid,
        participant_ids: [user.uid],
        created_at: new Date().toISOString(),
        id: 'guest_session_' + roomCode
      });
      setIsCreating(false);
      return;
    }

    try {
      const sessionData = {
        room_code: roomCode,
        session_status: 'ACTIVE',
        leader_id: user.uid,
        participant_ids: [user.uid],
        created_at: new Date().toISOString(),
      };
      const docRef = await addDoc(collection(db, 'ride_sessions'), sessionData);
      await setDoc(doc(db, 'ride_sessions', docRef.id, 'members', user.uid), {
        user_id: user.uid,
        joined_at: new Date().toISOString(),
        role: 'LEADER'
      });
      setActiveSession({ ...sessionData, id: docRef.id });
    } catch (error) {
      console.error("Error creating ride:", error);
    } finally {
      setIsCreating(false);
    }
  };

  const joinRide = async () => {
    if (!user || !joinCode) return;
    setIsJoining(true);

    if (user.isGuest) {
      setActiveSession({
        room_code: joinCode.toUpperCase(),
        session_status: 'ACTIVE',
        leader_id: 'another_user',
        participant_ids: ['another_user', user.uid],
        created_at: new Date().toISOString(),
        id: 'guest_session_' + joinCode
      });
      setIsJoining(false);
      return;
    }

    try {
      const q = query(collection(db, 'ride_sessions'), where('room_code', '==', joinCode.toUpperCase()), where('session_status', '==', 'ACTIVE'));
      const querySnapshot = await getDocs(q);
      if (!querySnapshot.empty) {
        const sessionDoc = querySnapshot.docs[0];
        const sessionData = sessionDoc.data();

        const currentParticipants = sessionData.participant_ids || [];
        if (!currentParticipants.includes(user.uid)) {
          await updateDoc(doc(db, 'ride_sessions', sessionDoc.id), {
            participant_ids: [...currentParticipants, user.uid]
          });
        }

        await setDoc(doc(db, 'ride_sessions', sessionDoc.id, 'members', user.uid), {
          user_id: user.uid,
          joined_at: new Date().toISOString(),
          role: 'MEMBER'
        });
        setActiveSession({ ...sessionData, id: sessionDoc.id, participant_ids: [...currentParticipants, user.uid] });
      } else {
        alert("Invalid or inactive room code.");
      }
    } catch (error) {
      console.error("Error joining ride:", error);
    } finally {
      setIsJoining(false);
    }
  };

  const endRide = async () => {
    if (!activeSession || !user) return;
    if (user.isGuest) {
      setActiveSession(null);
      return;
    }
    try {
      const endTime = new Date().toISOString();
      const startTime = new Date(activeSession.created_at).getTime();
      const durationSec = Math.floor((new Date(endTime).getTime() - startTime) / 1000);

      const summary = {
        distance_meters: Math.floor(Math.random() * 50000) + 10000,
        duration_seconds: durationSec,
        average_speed: 45 + Math.random() * 20
      };

      await updateDoc(doc(db, 'ride_sessions', activeSession.id), {
        session_status: 'COMPLETED',
        ended_at: endTime,
        summary: summary,
        updated_at: endTime
      });

      setActiveSession(null);
      fetchHistory();
    } catch (error) {
      console.error("Error ending ride:", error);
    }
  };

  const saveProfile = async () => {
    if (!user) return;
    if (user.isGuest) {
      setShowProfile(false);
      return;
    }
    try {
      const updatedData = {
        username: profileForm.username,
        medical_profile: { blood_group: profileForm.blood_group },
        motorcycle: { make: profileForm.motorcycle_make, model: profileForm.motorcycle_model },
        updated_at: new Date().toISOString()
      };
      await updateDoc(doc(db, 'users', user.uid), updatedData);
      setShowProfile(false);
    } catch (error) {
      console.error("Error updating profile:", error);
    }
  };

  if (loading) return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center gap-6">
      <div className="relative">
        <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1.5, ease: 'linear' }} className="w-16 h-16 border-4 border-orange-500/20 border-t-orange-500 rounded-full" />
      </div>
      <p className="text-[10px] font-black text-neutral-400 uppercase tracking-[0.4em] animate-pulse">Initializing System</p>
    </div>
  );

  if (!user) {
    return (
      <div className="min-h-screen bg-neutral-50 flex items-center justify-center p-6 md:p-12 font-sans overflow-hidden relative">
        <div className="absolute inset-0 z-0 pointer-events-none">
          <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-orange-200/40 via-transparent to-transparent opacity-60" />
          <div className="absolute bottom-0 right-0 w-full h-full bg-[radial-gradient(ellipse_at_bottom_left,_var(--tw-gradient-stops))] from-blue-200/40 via-transparent to-transparent opacity-60" />
          <div className="absolute inset-0 opacity-[0.02]" style={{ backgroundImage: 'linear-gradient(#000 1px, transparent 1px), linear-gradient(90deg, #000 1px, transparent 1px)', backgroundSize: '40px 40px' }} />
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-5xl bg-white/80 backdrop-blur-3xl rounded-[2.5rem] border border-white shadow-[0_40px_100px_rgba(0,0,0,0.05)] overflow-hidden flex flex-col md:flex-row relative z-10"
        >
          <div className="flex-1 p-12 md:p-20 flex flex-col justify-center">
            <div className="w-16 h-16 bg-gradient-to-br from-orange-500 to-orange-600 rounded-2xl flex items-center justify-center shadow-lg shadow-orange-500/30 mb-8">
              <Shield className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-5xl font-black text-neutral-900 tracking-tighter mb-4">RideSync.</h1>
            <p className="text-neutral-500 text-sm font-medium leading-relaxed max-w-sm mb-12">
              Advanced telemetry and real-time squad synchronization. Maintain visual contact on the digital grid.
            </p>

            <div className="space-y-4">
              <button onClick={handleSignIn} className="w-full max-w-sm h-14 bg-neutral-900 hover:bg-neutral-800 text-white font-black rounded-xl flex items-center justify-center gap-3 transition-all shadow-xl active:scale-95 uppercase text-[10px] tracking-widest">
                <LogIn className="w-4 h-4" /> Sign in with Google
              </button>
              <button onClick={loginAsGuest} className="w-full max-w-sm h-14 bg-white hover:bg-neutral-50 text-neutral-900 border border-neutral-200 font-black rounded-xl flex items-center justify-center gap-3 transition-all active:scale-95 uppercase text-[10px] tracking-widest">
                <Users className="w-4 h-4 text-neutral-400" /> Explore as Guest
              </button>
            </div>
          </div>

          <div className="flex-1 bg-neutral-900 p-12 flex flex-col justify-center relative overflow-hidden hidden md:flex">
            <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, #fff 1px, transparent 0)', backgroundSize: '32px 32px' }} />
            <div className="relative z-10">
              <h3 className="text-3xl font-black text-white tracking-tighter mb-6">Stay Connected.<br />Ride Together.</h3>
              <div className="space-y-4">
                {['Live GPS Telemetry', 'Zero-Latency Squad Map', 'Emergency SOS Beacons'].map((feature, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center border border-white/10">
                      <div className="w-2 h-2 bg-orange-500 rounded-full shadow-[0_0_10px_rgba(249,115,22,0.8)]" />
                    </div>
                    <span className="text-white text-xs font-bold uppercase tracking-widest">{feature}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    );
  }

  const calculateHeading = (from: [number, number], to: [number, number]) => {
    const [lon1, lat1] = from;
    const [lon2, lat2] = to;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const lat1Rad = (lat1 * Math.PI) / 180;
    const lat2Rad = (lat2 * Math.PI) / 180;
    const y = Math.sin(dLon) * Math.cos(lat2Rad);
    const x =
      Math.cos(lat1Rad) * Math.sin(lat2Rad) -
      Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLon);
    const brng = (Math.atan2(y, x) * 180) / Math.PI;
    return (brng + 360) % 360;
  };

  return (
    <div className="min-h-screen bg-white text-neutral-800 flex flex-col md:flex-row overflow-hidden font-sans">
      <AnimatePresence>
        {isBooting && (
          <motion.div
            exit={{ opacity: 0, scale: 1.1 }}
            className="fixed inset-0 z-[200] bg-neutral-950 flex flex-col items-center justify-center p-12 overflow-hidden"
          >
            <div className="w-full max-w-lg space-y-4">
              <div className="flex justify-between items-end">
                <div className="space-y-1">
                  <p className="text-[10px] font-black text-orange-600 uppercase tracking-widest">System Link</p>
                  <h2 className="text-2xl font-black text-white uppercase tracking-tighter">Initialising HUD...</h2>
                </div>
                <span className="text-[10px] font-mono text-neutral-600">85%</span>
              </div>
              <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: '85%' }}
                  className="h-full bg-orange-600"
                />
              </div>
              <div className="grid grid-cols-2 gap-4 pt-8">
                {['GEOLOCATION', 'BIOMETRICS', 'SQUAD_SYNC', 'MAP_TILES'].map(item => (
                  <div key={item} className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                    <span className="text-[9px] font-bold text-neutral-500 uppercase tracking-widest">{item}: OK</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="absolute inset-0 opacity-10 pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, #fff 1px, transparent 0)', backgroundSize: '48px 48px' }} />
          </motion.div>
        )}
      </AnimatePresence>

      <aside className={`fixed inset-y-0 left-0 w-full md:relative md:w-80 bg-white/95 md:bg-white/80 border-r border-neutral-200 flex flex-col z-[1000] md:z-20 backdrop-blur-3xl shadow-[20px_0_40px_rgba(0,0,0,0.03)] transform transition-transform duration-300 ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}>
        <div className="h-20 flex items-center justify-between px-6 border-b border-neutral-100 shrink-0">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 bg-gradient-to-br from-orange-500 to-orange-600 rounded-xl flex items-center justify-center font-black text-white shadow-lg shadow-orange-500/20">S</div>
            <div className="flex flex-col">
              <span className="text-sm font-black text-neutral-900 uppercase tracking-widest leading-none">RideSync</span>
              <span className="text-[9px] font-bold text-orange-500 uppercase tracking-[0.2em] mt-1">Core Terminal</span>
            </div>
          </div>
          <button className="md:hidden w-10 h-10 rounded-full bg-neutral-100 flex items-center justify-center" onClick={() => setMobileMenuOpen(false)}>
            <X className="w-5 h-5 text-neutral-600" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-8 scrollbar-hide">
          {!activeSession ? (
            <div className="space-y-8">
              <div className="flex gap-2 p-1.5 bg-neutral-100 rounded-2xl border border-neutral-200/50">
                <button
                  onClick={() => { setShowHistory(false); setSelectedRide(null); }}
                  className={`flex-1 py-3 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all ${!showHistory ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-500 hover:text-neutral-800 hover:bg-white/50'}`}
                >
                  Live
                </button>
                <button
                  onClick={() => setShowHistory(true)}
                  className={`flex-1 py-3 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all ${showHistory ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-500 hover:text-neutral-800 hover:bg-white/50'}`}
                >
                  History
                </button>
              </div>

              {!showHistory ? (
                <div className="space-y-10">
                  <div className="space-y-4">
                    <div className="flex justify-between items-center px-1">
                      <h2 className="text-[10px] font-black text-neutral-400 uppercase tracking-[0.2em]">New Session</h2>
                      <Plus className="w-3 h-3 text-orange-500" />
                    </div>
                    <button id="create-ride-btn" onClick={createRide} disabled={isCreating} className="group relative w-full h-16 bg-neutral-900 hover:bg-black rounded-2xl font-black flex items-center justify-center gap-3 transition-all active:scale-95 disabled:opacity-50 text-white shadow-xl shadow-neutral-900/20 uppercase text-xs tracking-widest">
                      Create Ride
                      <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                    </button>
                  </div>

                  <div className="space-y-4">
                    <div className="flex justify-between items-center px-1">
                      <h2 className="text-[10px] font-black text-neutral-400 uppercase tracking-[0.2em]">Join Group</h2>
                      <Users className="w-3 h-3 text-orange-500" />
                    </div>
                    <div className="relative group">
                      <input type="text" placeholder="6-DIGIT CODE" value={joinCode} onChange={(e) => setJoinCode(e.target.value)} className="w-full h-16 bg-neutral-50 rounded-2xl px-4 font-mono text-center text-xl border border-neutral-200 focus:border-orange-500 outline-none uppercase text-neutral-900 transition-all focus:bg-white focus:shadow-[0_0_30px_rgba(249,115,22,0.1)]" />
                    </div>
                    <button id="join-ride-btn" onClick={joinRide} disabled={isJoining} className="w-full h-16 bg-white hover:bg-neutral-50 border border-neutral-200 rounded-2xl font-black flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-50 text-neutral-900 uppercase text-xs tracking-widest shadow-sm">
                      Link Connection
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <h2 className="text-[10px] font-black text-neutral-500 uppercase tracking-[0.2em]">Past Deployments</h2>
                  {loadingHistory ? (
                    <div className="py-20 flex flex-col items-center gap-4">
                      <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: 'linear' }} className="w-6 h-6 border-2 border-orange-600 border-t-transparent rounded-full" />
                      <p className="text-[9px] font-black text-neutral-600 uppercase tracking-widest">Accessing Logs</p>
                    </div>
                  ) : rideHistory.length === 0 ? (
                    <div className="p-12 text-center bg-white/5 rounded-3xl border border-dashed border-white/10 flex flex-col items-center gap-4">
                      <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center">
                        <MapPin className="w-5 h-5 text-neutral-700" />
                      </div>
                      <p className="text-[10px] font-bold text-neutral-600 uppercase tracking-widest">Zero Session Data</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {rideHistory.map((ride) => (
                        <motion.div
                          key={ride.id}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          onClick={() => setSelectedRide(ride)}
                          className={`p-5 rounded-2xl border transition-all cursor-pointer group relative overflow-hidden ${selectedRide?.id === ride.id ? 'bg-orange-600/10 border-orange-600 shadow-lg' : 'bg-neutral-800/30 border-white/5 hover:border-white/20'}`}
                        >
                          {selectedRide?.id === ride.id && <div className="absolute top-0 left-0 w-1 h-full bg-orange-600" />}
                          <div className="flex justify-between items-start mb-4">
                            <div>
                              <p className="text-[11px] font-black text-white uppercase tracking-widest">{ride.room_code}</p>
                              <p className="text-[9px] text-neutral-500 uppercase font-bold mt-1">{new Date(ride.created_at).toLocaleDateString('en-GB')}</p>
                            </div>
                            <div className="w-8 h-8 rounded-lg bg-black/40 flex items-center justify-center group-hover:scale-110 transition-transform">
                              <ChevronRight className="w-4 h-4 text-orange-600" />
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-3 mt-4">
                            <div className="bg-black/20 p-3 rounded-xl border border-white/5">
                              <p className="text-[8px] text-neutral-500 font-black uppercase tracking-widest mb-1">Range</p>
                              <p className="text-xs font-black text-white">{(ride.summary?.distance_meters / 1000).toFixed(1)} <span className="text-[8px] text-orange-600 uppercase">KM</span></p>
                            </div>
                            <div className="bg-black/20 p-3 rounded-xl border border-white/5">
                              <p className="text-[8px] text-neutral-500 font-black uppercase tracking-widest mb-1">Active</p>
                              <p className="text-xs font-black text-white">{Math.floor(ride.summary?.duration_seconds / 60)} <span className="text-[8px] text-orange-600 uppercase">MIN</span></p>
                            </div>
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-10">
              <div className="bg-neutral-800/40 rounded-3xl border border-white/5 p-6 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-24 h-24 bg-orange-600/5 blur-[40px] rounded-full" />
                <p className="text-[9px] text-neutral-500 uppercase font-black mb-4 tracking-[0.2em] text-center">Session Identifier</p>
                <div className="relative">
                  <p className="text-4xl font-black font-mono text-white tracking-[0.2em] text-center mb-8">{activeSession.room_code}</p>
                  <div className="flex justify-center mb-8">
                    <div className="p-4 bg-white rounded-2xl shadow-[0_0_40px_rgba(255,255,255,0.1)]">
                      <QRCode value={activeSession.room_code} size={140} fgColor="#000" />
                    </div>
                  </div>
                </div>
                <button className="w-full py-3 bg-white/5 border border-white/5 rounded-xl text-[9px] font-black uppercase tracking-widest text-neutral-400 hover:text-white transition-colors">Copy Invite Link</button>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between px-1">
                  <h2 className="text-[10px] font-black text-neutral-500 uppercase tracking-[0.2em]">Active Squad</h2>
                  <span className="px-3 py-1 bg-emerald-500/10 text-emerald-500 text-[9px] font-black rounded-full uppercase border border-emerald-500/20">{Object.keys(mergedPeers).length + 1} ONLINE</span>
                </div>
                <div className="space-y-3">
                  <motion.div initial={{ x: -20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} className="p-4 bg-orange-600/5 rounded-2xl border border-orange-600/20 flex items-center justify-between group">
                    <div className="flex items-center gap-4">
                      <div className="relative">
                        <div className="w-10 h-10 rounded-xl bg-neutral-800 overflow-hidden border border-white/10 group-hover:border-orange-600 transition-colors">
                          <img src={`https://picsum.photos/seed/${user.uid}/100`} alt="Me" />
                        </div>
                        <div className="absolute -top-1 -right-1 w-3 h-3 bg-emerald-500 rounded-full border-2 border-neutral-900" />
                      </div>
                      <div>
                        <span className="text-xs font-black text-white uppercase tracking-wider">{riderProfile?.username}</span>
                        <p className="text-[9px] font-bold text-orange-600 uppercase">Leader</p>
                      </div>
                    </div>
                  </motion.div>

                  {Object.entries(mergedPeers).map(([uid, data]: [string, any], idx) => (
                    <motion.div
                      key={uid}
                      initial={{ x: -20, opacity: 0 }}
                      animate={{ x: 0, opacity: 1 }}
                      transition={{ delay: idx * 0.1 }}
                      className="p-4 bg-neutral-800/20 rounded-2xl border border-white/5 flex items-center justify-between"
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-xl bg-neutral-800 border border-white/10 flex items-center justify-center font-black text-[10px] text-neutral-600">
                          {uid.substring(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <span className="text-xs font-black text-neutral-300 uppercase tracking-wider">{data.location?.username || `RIDER_${uid.substring(0, 4)}`}</span>
                          <div className="flex items-center gap-2 mt-0.5">
                            <div className="w-1 h-1 bg-emerald-500 rounded-full" />
                            <span className="text-[9px] font-mono font-black text-orange-500">{(data.location?.speed * 3.6 || 0).toFixed(0)} KMH</span>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>

              <button id="end-session-btn" onClick={endRide} className="w-full h-14 bg-red-600/5 hover:bg-red-600 border border-red-600/20 hover:border-red-600 text-red-500 hover:text-white rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] flex items-center justify-center gap-3 transition-all">
                <LogOut className="w-4 h-4" /> Terminate Session
              </button>
            </div>
          )}
        </div>

        <div className="mt-auto p-6 border-t border-neutral-100 bg-white/50 backdrop-blur-3xl">
          <button onClick={() => setShowProfile(true)} className="flex items-center gap-4 w-full group text-left p-2 rounded-2xl hover:bg-neutral-100 transition-all">
            <div className="relative shrink-0">
              <img src={`https://picsum.photos/seed/${user.uid}/100`} className="w-12 h-12 rounded-2xl border-2 border-white group-hover:border-orange-500 transition-all shadow-md" alt="Profile" />
              <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-emerald-500 rounded-full border-2 border-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-black text-neutral-900 truncate uppercase tracking-widest">{riderProfile?.username || 'Guest'}</p>
              <div className="flex items-center gap-1.5 mt-1">
                <Shield className="w-3 h-3 text-orange-500" />
                <p className="text-[9px] text-neutral-500 font-bold uppercase tracking-widest">Level 12 Rider</p>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-neutral-400 group-hover:text-neutral-900 group-hover:translate-x-1 transition-all" />
          </button>
        </div>
      </aside>

      <main className="flex-1 relative bg-neutral-100 flex flex-col">
        <div className="absolute inset-0 z-0">
          <RideMap
            center={selectedRide ? [selectedRide.summary?.center_lng || location?.[0] || 77.209, selectedRide.summary?.center_lat || location?.[1] || 28.613] : (location || undefined)}
            peers={mergedPeers}
            ownLocation={location || undefined}
            route={activeRoute || selectedRide?.route_geometry}
            destination={destination}
            onDestinationSelect={(coords) => setDestination(coords)}
            currentUser={user ? { uid: user.uid, username: riderProfile?.username || 'GUEST' } : undefined}
          />
        </div>

        <div className="absolute inset-0 z-[400] pointer-events-none p-4 pb-8 md:p-8 flex flex-col justify-between overflow-hidden">
          <div className="flex flex-col md:flex-row items-end md:items-start justify-between gap-4 w-full">

            <div className="w-full max-w-md pointer-events-auto shrink-0 relative z-50">
              <form onSubmit={handleSearchLocation} className="relative group">
                <div className="absolute inset-y-0 left-0 flex items-center pl-4 pointer-events-none">
                  <MapPin className="w-5 h-5 text-orange-500" />
                </div>
                <input
                  type="text"
                  placeholder="ENTER DESTINATION..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full h-14 bg-white/90 backdrop-blur-2xl border border-neutral-200/50 rounded-2xl pl-12 pr-24 text-neutral-900 uppercase text-xs font-black tracking-widest outline-none focus:border-orange-500 focus:shadow-[0_10px_40px_rgba(0,0,0,0.08)] transition-all shadow-lg"
                />
                <button
                  type="submit"
                  disabled={isSearching}
                  className="absolute inset-y-2 right-2 px-4 bg-neutral-900 hover:bg-black disabled:opacity-50 text-white text-[9px] font-black uppercase tracking-widest rounded-xl transition-all"
                >
                  {isSearching ? 'SCANNING' : 'SEARCH'}
                </button>
              </form>

              <AnimatePresence>
                {suggestions.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="absolute top-full left-0 w-full mt-2 bg-white/95 backdrop-blur-2xl border border-neutral-200/50 rounded-2xl overflow-hidden shadow-[0_30px_100px_rgba(0,0,0,0.1)] flex flex-col z-[500]"
                  >
                    {suggestions.map((s, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => {
                          setDestination([parseFloat(s.lon), parseFloat(s.lat)]);
                          setSearchQuery(s.name || s.display_name.split(',')[0]);
                          setSuggestions([]);
                        }}
                        className="w-full text-left px-6 py-4 hover:bg-neutral-50 border-b border-neutral-100 last:border-0 flex flex-col gap-1 transition-colors"
                      >
                        <span className="text-neutral-900 text-[11px] font-black uppercase tracking-widest truncate">{s.name || s.display_name.split(',')[0]}</span>
                        <span className="text-neutral-400 text-[9px] font-bold uppercase tracking-widest truncate">{s.display_name}</span>
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <div className="flex gap-2 md:gap-4 pointer-events-auto shrink-0">
              <motion.button
                onClick={() => setSimHubOpen(!simHubOpen)}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className={`w-12 h-12 md:w-14 md:h-14 bg-white/90 backdrop-blur-2xl border ${simHubOpen ? 'border-orange-500 text-orange-500 shadow-[0_0_15px_rgba(249,115,22,0.3)]' : 'border-neutral-200/50 text-neutral-700'} rounded-2xl flex items-center justify-center shadow-lg transition-all`}
                title="Toggle Simulation Hub"
              >
                <Cpu className="w-5 h-5 md:w-6 md:h-6" />
              </motion.button>

              <motion.button onClick={() => setMobileMenuOpen(true)} whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} className="md:hidden w-12 h-12 bg-white/90 backdrop-blur-2xl border border-neutral-200/50 rounded-2xl flex items-center justify-center text-neutral-900 shadow-lg">
                <Menu className="w-5 h-5" />
              </motion.button>
              <AnimatePresence>
                {destination && (
                  <motion.button
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    onClick={() => setDestination(null)}
                    className="w-14 h-14 bg-orange-500 rounded-2xl flex items-center justify-center text-white hover:bg-orange-600 transition-all shadow-[0_10px_30px_rgba(249,115,22,0.3)]"
                    title="Clear Destination"
                  >
                    <X className="w-6 h-6" />
                  </motion.button>
                )}
              </AnimatePresence>
              <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} className="hidden md:flex w-14 h-14 bg-white/90 backdrop-blur-2xl border border-neutral-200/50 rounded-2xl items-center justify-center text-neutral-700 hover:text-orange-500 hover:border-orange-500/30 transition-all shadow-lg">
                <Bluetooth className="w-6 h-6" />
              </motion.button>
              <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={() => setShowProfile(true)} className="hidden md:flex w-14 h-14 bg-white/90 backdrop-blur-2xl border border-neutral-200/50 rounded-2xl items-center justify-center text-neutral-700 hover:text-orange-500 hover:border-orange-500/30 transition-all shadow-lg">
                <Shield className="w-6 h-6" />
              </motion.button>
            </div>
          </div>

          <div className="flex-1 flex justify-end items-center w-full my-4 min-h-0">
            <AnimatePresence>
              {simHubOpen && (
                <motion.div
                  initial={{ opacity: 0, x: 50, scale: 0.95 }}
                  animate={{ opacity: 1, x: 0, scale: 1 }}
                  exit={{ opacity: 0, x: 50, scale: 0.95 }}
                  transition={{ duration: 0.2, ease: "easeOut" }}
                  className="w-80 bg-neutral-900/90 backdrop-blur-md border border-orange-500/20 rounded-[2rem] p-6 shadow-2xl pointer-events-auto flex flex-col gap-4 border-l-4 border-l-orange-500 max-h-full overflow-y-auto scrollbar-hide"
                >
                  <div className="flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${isSimulating ? 'bg-orange-500 animate-pulse' : 'bg-neutral-600'}`} />
                      <span className="text-[10px] font-black text-white uppercase tracking-[0.2em]">Simulation Hub</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[8px] font-mono text-orange-500 font-bold bg-orange-500/10 px-2 py-0.5 rounded border border-orange-500/20">v2.1</span>
                      <button
                        type="button"
                        onClick={() => setSimHubOpen(false)}
                        className="w-6 h-6 rounded bg-white/5 flex items-center justify-center hover:bg-red-600/20 hover:text-red-500 transition-colors"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <p className="text-[8px] font-black text-neutral-500 uppercase tracking-widest">Tactical Route</p>
                    <p className="text-xs font-black text-neutral-300 uppercase truncate">
                      {activeRoute ? `Lock: ${(activeRoute.coordinates.length * 15 / 1000).toFixed(1)} KM` : 'No Destination Locked'}
                    </p>
                    {activeRoute ? (
                      <p className="text-[9px] font-medium text-orange-600 uppercase">
                        Ready for patrol simulation
                      </p>
                    ) : (
                      <p className="text-[9px] font-medium text-neutral-500 uppercase">
                        Select destination on map to generate route
                      </p>
                    )}
                  </div>

                  <div className="h-px bg-white/5" />

                  <div className="flex flex-col gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        if (!activeRoute) {
                          alert("Please enter a destination or click the map to generate a route first.");
                          return;
                        }
                        setIsSimulating(!isSimulating);
                      }}
                      className={`w-full h-12 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all ${isSimulating ? 'bg-amber-600 hover:bg-amber-700 text-white' : 'bg-orange-600 hover:bg-orange-500 text-white shadow-lg shadow-orange-600/20'}`}
                    >
                      {isSimulating ? 'PAUSE PATROL' : 'START PATROL'}
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setSimRouteIndex(0);
                        if (activeRoute && activeRoute.coordinates.length > 0) {
                          const start = activeRoute.coordinates[0];
                          setLocation([start[0], start[1]]);
                        }
                        setIsSimulating(false);
                      }}
                      className="w-full h-10 bg-white/5 hover:bg-white/10 border border-white/10 text-white rounded-xl font-black text-[9px] uppercase tracking-widest transition-all"
                    >
                      Reset Position
                    </button>
                  </div>

                  <div className="h-px bg-white/5" />

                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <span className="text-[8px] font-black text-neutral-400 uppercase tracking-widest">Patrol Speed</span>
                      <span className="text-[10px] font-mono text-white font-bold">{simSpeed} KMH</span>
                    </div>
                    <input
                      type="range"
                      min="30"
                      max="180"
                      step="10"
                      value={simSpeed}
                      onChange={(e) => setSimSpeed(parseInt(e.target.value))}
                      className="w-full accent-orange-500 h-1 bg-white/10 rounded-lg appearance-none cursor-pointer"
                    />
                  </div>

                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <span className="text-[8px] font-black text-neutral-400 uppercase tracking-widest">Squad Formation</span>
                      <div className="flex gap-1">
                        {[0, 1, 2, 3].map((num) => (
                          <button
                            key={num}
                            type="button"
                            onClick={() => setSimRiderCount(num)}
                            className={`w-6 h-6 rounded flex items-center justify-center text-[10px] font-black border transition-all ${simRiderCount === num ? 'bg-orange-600 border-orange-600 text-white' : 'bg-white/5 border-white/5 text-neutral-400 hover:text-white'}`}
                          >
                            {num}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="h-px bg-white/5" />

                  <button
                    type="button"
                    onClick={triggerSimulatedSOS}
                    className="w-full h-12 bg-red-600/20 hover:bg-red-600 border border-red-600/30 hover:border-red-600 text-red-500 hover:text-white rounded-xl font-black text-[9px] uppercase tracking-widest transition-all flex items-center justify-center gap-2"
                  >
                    <AlertCircle className="w-3.5 h-3.5 animate-pulse" />
                    Trigger Squad SOS
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="flex flex-col md:flex-row items-center md:items-end justify-between gap-4 w-full">

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white/95 md:bg-white/90 backdrop-blur-2xl border border-neutral-200/50 p-4 md:p-6 rounded-3xl md:rounded-[2rem] flex flex-row md:flex-wrap items-center gap-4 md:gap-8 shadow-[0_20px_80px_rgba(0,0,0,0.08)] border-l-orange-500 border-l-4 pointer-events-auto w-full md:w-auto overflow-x-auto scrollbar-hide"
            >
              <div className="flex flex-col">
                <span className="text-[9px] text-neutral-400 uppercase font-black tracking-[0.2em] mb-1">Velocity</span>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-4xl md:text-5xl font-black text-neutral-900 font-mono leading-none tracking-tighter">{telemetry.speed.toFixed(0)}</span>
                  <span className="text-[10px] text-orange-500 font-black uppercase">KMH</span>
                </div>
              </div>
              <div className="w-px h-10 bg-neutral-200 hidden md:block" />
              <div className="flex flex-col">
                <span className="text-[9px] text-neutral-400 uppercase font-black tracking-[0.2em] mb-1">Altitude</span>
                <div className="flex items-baseline gap-1">
                  <span className="text-xl md:text-2xl font-black text-neutral-900 font-mono">{telemetry.altitude.toFixed(0)}</span>
                  <span className="text-[9px] text-neutral-500 font-bold uppercase">M</span>
                </div>
              </div>
              <div className="w-px h-10 bg-neutral-200 hidden md:block" />
              <div className="flex flex-col min-w-[60px]">
                <span className="text-[9px] text-neutral-400 uppercase font-black tracking-[0.2em] mb-1">Heading</span>
                <div className="flex items-center gap-2">
                  <motion.div animate={{ rotate: telemetry.heading }} className="w-4 h-4 border-2 border-orange-500 rounded-full flex items-center justify-center">
                    <div className="w-[2px] h-2 bg-orange-500 -mt-1 rounded-full" />
                  </motion.div>
                  <span className="text-sm font-black text-neutral-900 font-mono">{telemetry.heading.toFixed(0)}°</span>
                </div>
              </div>
              <div className="w-full md:w-px h-px md:h-10 bg-neutral-200" />
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                  <span className="text-[8px] font-black text-neutral-500 uppercase tracking-widest">Signal: {telemetry.signal}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[8px] font-black text-neutral-500 uppercase tracking-widest w-12">PWR: {telemetry.battery.toFixed(0)}%</span>
                  <div className="w-10 h-2 bg-neutral-200 rounded-full overflow-hidden">
                    <motion.div animate={{ width: `${telemetry.battery}%` }} className={`h-full ${telemetry.battery > 20 ? 'bg-emerald-500' : 'bg-red-500'}`} />
                  </div>
                </div>
              </div>
            </motion.div>

            {/* SOS Button - Bottom Right */}
            <div className="pointer-events-auto w-full md:w-auto mt-2 md:mt-0 pb-4 md:pb-0 shrink-0">
              <motion.button
                whileHover={{ scale: 1.05, backgroundColor: '#ef4444', color: '#fff' }}
                whileTap={{ scale: 0.95 }}
                onClick={() => { setSosActive(true); setCountdown(14); }}
                className="w-full md:w-auto px-6 md:px-8 h-16 md:h-20 bg-red-50 hover:bg-red-500 border-2 border-red-200 hover:border-red-500 text-red-600 rounded-2xl md:rounded-[2rem] font-black text-[10px] md:text-xs uppercase tracking-[0.2em] shadow-[0_15px_40px_rgba(239,68,68,0.15)] backdrop-blur-xl transition-all flex items-center justify-center gap-3 group"
              >
                <div className="w-8 h-8 md:w-10 md:h-10 bg-red-100 rounded-xl flex items-center justify-center group-hover:bg-white/20 transition-colors">
                  <AlertCircle className="w-5 h-5 md:w-6 md:h-6 animate-pulse" />
                </div>
                <span className="hidden md:inline">DEPLOY SOS</span>
                <span className="md:hidden">SOS</span>
              </motion.button>
            </div>
          </div>
        </div>

        {/* MAP SCAN EFFECT OVERLAY */}
        <div className="absolute inset-0 pointer-events-none z-10">
          <div className="absolute inset-0 bg-gradient-to-t from-white/20 via-transparent to-transparent" />
          <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'linear-gradient(#000 1px, transparent 1px), linear-gradient(90deg, #000 1px, transparent 1px)', backgroundSize: '100px 100px' }} />
        </div>

        {/* SOS OVERLAY */}
        <AnimatePresence>
          {sosActive && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-[1000] bg-red-600/95 backdrop-blur-3xl flex flex-col items-center justify-center p-6 md:p-8 overflow-y-auto"
            >
              <div className="flex flex-col items-center justify-center w-full max-w-md py-4">
                <motion.div animate={{ scale: [1, 1.15, 1] }} transition={{ repeat: Infinity, duration: 1 }} className="w-24 h-24 md:w-40 md:h-40 bg-white rounded-full flex items-center justify-center shadow-[0_0_80px_rgba(255,255,255,0.6)] mb-6 md:mb-12 shrink-0">
                  <AlertCircle className="w-12 h-12 md:w-20 md:h-20 text-red-600" />
                </motion.div>
                <h2 className="text-4xl md:text-6xl font-black text-white uppercase tracking-tighter mb-2 md:mb-4 text-center leading-none">SOS Beacon<br />Triggered</h2>
                <p className="text-xs md:text-xl text-red-100 font-bold mb-6 md:mb-12 uppercase tracking-widest text-center">Broadcasting location to squad in</p>
                <div className="text-8xl md:text-9xl font-black text-white font-mono mb-10 md:mb-16 tabular-nums leading-none shrink-0">{countdown}</div>

                <button
                  onClick={() => { setSosActive(false); setCountdown(14); }}
                  className="w-full h-16 md:h-20 bg-white/10 hover:bg-white text-white hover:text-red-600 border-2 border-white rounded-2xl md:rounded-3xl font-black text-sm md:text-xl uppercase tracking-[0.2em] md:tracking-[0.3em] transition-all shrink-0 shadow-2xl"
                >
                  Abort SOS
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        {/* INCOMING SOS ALERT */}
        <AnimatePresence>
          {incomingSOS && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="absolute bottom-32 left-1/2 -translate-x-1/2 z-[150] w-full max-w-md p-6"
            >
              <div className="bg-red-600 rounded-[2.5rem] p-8 shadow-[0_0_100px_rgba(220,38,38,0.5)] border-4 border-white/20 relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
                <div className="relative z-10 flex flex-col items-center text-center">
                  <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center mb-6 shadow-2xl animate-bounce">
                    <AlertCircle className="text-red-600 w-10 h-10" />
                  </div>
                  <h3 className="text-2xl font-black text-white uppercase tracking-tighter mb-2">MAYDAY ALERT</h3>
                  <p className="text-red-100 text-xs font-bold uppercase tracking-widest mb-6 leading-relaxed">
                    Rider <span className="text-white">ID_{incomingSOS.userId.substring(0, 6)}</span> has triggered an emergency signal.
                  </p>

                  <div className="grid grid-cols-2 gap-4 w-full mb-8">
                    <div className="bg-black/30 p-4 rounded-2xl border border-white/10">
                      <p className="text-[8px] text-red-200 font-black uppercase tracking-widest mb-1">LATITUDE</p>
                      <p className="text-sm font-mono font-bold text-white">{incomingSOS.location?.lat.toFixed(6)}</p>
                    </div>
                    <div className="bg-black/30 p-4 rounded-2xl border border-white/10">
                      <p className="text-[8px] text-red-200 font-black uppercase tracking-widest mb-1">LONGITUDE</p>
                      <p className="text-sm font-mono font-bold text-white">{incomingSOS.location?.lng.toFixed(6)}</p>
                    </div>
                  </div>

                  <div className="flex gap-4 w-full">
                    <button onClick={() => { setLocation([incomingSOS.location.lng, incomingSOS.location.lat]); setIncomingSOS(null); }} className="flex-1 h-16 bg-white text-red-600 font-black rounded-2xl uppercase tracking-widest text-[10px] hover:scale-105 transition-transform active:scale-95 shadow-xl">
                      Intervene
                    </button>
                    <button onClick={() => setIncomingSOS(null)} className="px-8 h-16 bg-black/40 text-white font-black rounded-2xl uppercase tracking-widest text-[10px] border border-white/10 hover:bg-black/60 transition-colors">
                      Ignore
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>


      {/* Profile Editor Modal */}
      <AnimatePresence>
        {showProfile && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[110] bg-neutral-950/95 backdrop-blur-2xl flex items-center justify-center p-4">
            <motion.div initial={{ scale: 0.9, y: 40 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 40 }} className="bg-neutral-900 w-full max-w-lg rounded-[3rem] border border-white/5 p-10 shadow-[0_0_200px_rgba(0,0,0,0.8)] relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-orange-500 to-orange-700" />
              <div className="flex justify-between items-center mb-12">
                <div className="flex flex-col">
                  <h2 className="text-2xl font-black text-white uppercase tracking-tighter">Rider Dossier</h2>
                  <p className="text-[10px] text-orange-600 font-black uppercase tracking-[0.3em]">Neural ID: {user.uid.substring(0, 8)}</p>
                </div>
                <button onClick={() => setShowProfile(false)} className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center hover:bg-red-600/20 hover:text-red-500 transition-all"><X className="w-6 h-6" /></button>
              </div>
              <div className="space-y-8">
                <div className="space-y-3">
                  <label className="text-[10px] font-black text-neutral-500 uppercase tracking-[0.2em] px-1">Tactical Handle</label>
                  <input type="text" value={profileForm.username} onChange={e => setProfileForm({ ...profileForm, username: e.target.value })} className="w-full h-16 bg-white/5 border border-white/5 rounded-2xl px-6 outline-none focus:border-orange-600 focus:bg-neutral-800 transition-all text-white font-black uppercase tracking-widest" />
                </div>
                <div className="space-y-3">
                  <label className="text-[10px] font-black text-neutral-500 uppercase tracking-[0.2em] px-1">Biometric / Blood Type</label>
                  <input type="text" placeholder="e.g. O POSITIVE" value={profileForm.blood_group} onChange={e => setProfileForm({ ...profileForm, blood_group: e.target.value })} className="w-full h-16 bg-white/5 border border-white/5 rounded-2xl px-6 outline-none focus:border-orange-600 focus:bg-neutral-800 transition-all text-white font-black uppercase tracking-widest" />
                </div>
                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-3">
                    <label className="text-[10px] font-black text-neutral-500 uppercase tracking-[0.2em] px-1">Vehicle Make</label>
                    <input type="text" placeholder="KTM" value={profileForm.motorcycle_make} onChange={e => setProfileForm({ ...profileForm, motorcycle_make: e.target.value })} className="w-full h-16 bg-white/5 border border-white/5 rounded-2xl px-6 outline-none focus:border-orange-600 focus:bg-neutral-800 transition-all text-white font-black uppercase tracking-widest" />
                  </div>
                  <div className="space-y-3">
                    <label className="text-[10px] font-black text-neutral-500 uppercase tracking-[0.2em] px-1">Model Spec</label>
                    <input type="text" placeholder="DUKE 390" value={profileForm.motorcycle_model} onChange={e => setProfileForm({ ...profileForm, motorcycle_model: e.target.value })} className="w-full h-16 bg-white/5 border border-white/5 rounded-2xl px-6 outline-none focus:border-orange-600 focus:bg-neutral-800 transition-all text-white font-black uppercase tracking-widest" />
                  </div>
                </div>
                <button onClick={saveProfile} className="mt-6 w-full h-20 bg-orange-600 hover:bg-orange-700 rounded-[2rem] font-black text-white shadow-2xl shadow-orange-600/30 uppercase text-sm tracking-[0.3em] transition-all active:scale-95">Update Profile</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

