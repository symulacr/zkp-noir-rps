import { io, Socket } from 'socket.io-client';

// define the events and their payloads if you want stricter typing
type EventHandler = (...args: any[]) => void;

const SOCKET_URL = 'http://localhost:4000';

class SocketService {
    public socket: Socket;

    constructor() {
        console.log('[SocketService] initializing service...');
        this.socket = io(SOCKET_URL, {
            transports: ['websocket'],
            autoConnect: true,
            reconnectionAttempts: 5,
            reconnectionDelay: 3000,
        });

        this.socket.on('connect', () => {
            console.log('[SocketService] IO Connected, ID:', this.socket.id);
        });

        this.socket.on('disconnect', (reason: Socket.DisconnectReason) => {
            console.warn('[SocketService] IO Disconnected. Reason:', reason);
        });

        this.socket.on('connect_error', (err: Error) => {
            console.error('[SocketService] IO Connection Error:', err.message, err);
        });
    }

    public connect(): void {
        if (!this.socket.connected) {
            console.log('[SocketService] connect() called. attempting to connect socket...');
            this.socket.connect();
        } else {
            console.log('[SocketService] connect() called, but socket is already connected.');
        }
    }

    public disconnect(): void {
        if (this.socket.connected) {
            console.log('[SocketService] disconnect() called. disconnecting socket...');
            this.socket.disconnect();
        } else {
            console.log('[SocketService] disconnect() called, but socket is already disconnected.');
        }
    }

    public emit(eventName: string, data: unknown): void {
        this.socket.emit(eventName, data);
    }

    public on(eventName: string, handler: EventHandler): void {
        this.socket.on(eventName, handler);
    }

    public off(eventName: string, handler?: EventHandler): void {
        this.socket.off(eventName, handler);
    }
}

export const socketService = new SocketService();