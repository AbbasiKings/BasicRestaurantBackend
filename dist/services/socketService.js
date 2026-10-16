"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.initSocketServer = initSocketServer;
exports.broadcastNewOrder = broadcastNewOrder;
const socket_io_1 = require("socket.io");
let io = null;
function initSocketServer(httpServer) {
    io = new socket_io_1.Server(httpServer, {
        cors: {
            origin: '*',
            methods: ['GET', 'POST', 'PUT', 'DELETE'],
        },
    });
    io.on('connection', (socket) => {
        console.log(`🔌 [Socket.io] Admin / Client connected: ${socket.id}`);
        socket.on('disconnect', () => {
            console.log(`🔌 [Socket.io] Client disconnected: ${socket.id}`);
        });
    });
    return io;
}
function broadcastNewOrder(order) {
    if (io) {
        console.log(`📡 [Socket.io] Broadcasting new order ${order.order_number}`);
        io.emit('new_order', order);
    }
}
