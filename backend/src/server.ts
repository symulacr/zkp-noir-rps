// backend/src/server.ts
import express from 'express';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import cors from 'cors';
import { initializeGameEvents } from './gameManager';

const app = express();
app.use(cors({ origin: 'http://localhost:3000' })); // Allow frontend origin
app.use(express.json());

const server = http.createServer(app);
const io = new SocketIOServer(server, {
    cors: {
        origin: 'http://localhost:3000',
        methods: ['GET', 'POST', 'OPTIONS'],
        credentials: true
    },
});

const PORT = process.env.PORT || 4000;

initializeGameEvents(io);

server.listen(PORT, () => {
    console.log(`ZK-RPS Backend Server listening on port ${PORT}`);
    console.log('Make sure Noir circuits are compiled and nargo is in PATH.');
    console.log('Commitment Helper Circuit Path (expected):../noir_circuits/commitment_helper');
    console.log('RPS Logic Circuit Path (expected):../noir_circuits/rps_logic');
});