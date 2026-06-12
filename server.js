import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import next from 'next';
import cors from 'cors';
import dotenv from 'dotenv';
import { parse } from 'url';

dotenv.config();

const port = 3000;
const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const expressApp = express();
  const httpServer = createServer(expressApp);
  const io = new Server(httpServer);

  expressApp.use(cors());
  expressApp.use(express.json());

  io.on('connection', (socket) => {
    socket.on('join_ride', (roomCode) => {
      socket.join(roomCode);
    });

    socket.on('location_update', (data) => {
      const { roomCode, userId, location } = data;
      socket.to(roomCode).emit('peer_location', { userId, location });
    });

    socket.on('sos_broadcast', (data) => {
      const { roomCode, userId, location } = data;
      io.to(roomCode).emit('sos_alert', { userId, location });
    });
  });

  expressApp.all(/.*/, (req, res) => {
    const parsedUrl = parse(req.url, true);
    handle(req, res, parsedUrl);
  });

  httpServer.listen(port, () => {
    console.log(`> Ready on PORT ${port}`);
  });
});
