import { io, Socket } from 'socket.io-client';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || import.meta.env.VITE_API_URL || 'https://api-seltpos.soudev.site';

export const socket: Socket = io(SOCKET_URL, {
  autoConnect: true,
  transports: ['polling', 'websocket'],
});
