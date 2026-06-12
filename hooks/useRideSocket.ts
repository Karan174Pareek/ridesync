import { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';

export function useRideSocket(roomCode: string | null, onSOS?: (data: any) => void) {
  const socketRef = useRef<Socket | null>(null);
  const [peers, setPeers] = useState<Record<string, any>>({});

  useEffect(() => {
    if (!roomCode) return;

    const socket = io();
    socketRef.current = socket;

    socket.emit('join_ride', roomCode);

    socket.on('peer_location', (data) => {
      const { userId, location } = data;
      setPeers((prev) => ({
        ...prev,
        [userId]: { ...prev[userId], location }
      }));
    });

    socket.on('sos_alert', (data) => {
      console.warn(`SOS ALERT from user: ${data.userId}`);
      if (onSOS) onSOS(data);
    });

    return () => {
      socket.disconnect();
    };
  }, [roomCode, onSOS]);

  const updateLocation = (userId: string, location: any) => {
    if (socketRef.current && roomCode) {
      socketRef.current.emit('location_update', { roomCode, userId, location });
    }
  };

  const broadcastSOS = (userId: string, location: any) => {
    if (socketRef.current && roomCode) {
      socketRef.current.emit('sos_broadcast', { roomCode, userId, location });
    }
  };

  return { peers, updateLocation, broadcastSOS };
}

