import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import next from 'next';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const port = parseInt(process.env.PORT || '3000', 10);
const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const expressApp = express();
  const httpServer = createServer(expressApp);
  const io = new Server(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    }
  });

  expressApp.use(cors());
  expressApp.use(express.json());

  // Socket.io handlers
  io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);

    socket.on('join_ride', (roomCode) => {
      socket.join(roomCode);
      console.log(`User ${socket.id} joined room: ${roomCode}`);
    });

    socket.on('location_update', (data) => {
      const { roomCode, userId, location } = data;
      // Broadcast location to all others in the room
      socket.to(roomCode).emit('peer_location', { userId, location });
    });

    // WebRTC Signaling
    socket.on('signal', (data) => {
      const { roomCode, userId, signal } = data;
      socket.to(roomCode).emit('signal', { userId: socket.id, signal });
    });

    socket.on('sos_broadcast', (data) => {
      const { roomCode, userId, location } = data;
      io.to(roomCode).emit('sos_alert', { userId, location });
    });

    socket.on('disconnect', () => {
      console.log('Client disconnected:', socket.id);
    });
  });

  // Next.js handler
  expressApp.all('*', (req, res) => {
    return handle(req, res);
  });

  httpServer.listen(port, () => {
    console.log(`> Ready on http://localhost:${port}`);
  });
});
