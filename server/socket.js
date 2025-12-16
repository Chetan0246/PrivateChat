const { Server } = require('socket.io');
const db = require('./db');
const { v4: uuidv4 } = require('uuid');

module.exports = function(httpServer, sessionMiddleware, app) {
  const io = new Server(httpServer, { cors: { origin: true, credentials: true } });

  // attach session to socket
  io.use((socket, next) => {
    sessionMiddleware(socket.request, {}, next);
  });

  const lastMsgAtByIp = new Map();

  io.on('connection', (socket) => {
    const req = socket.request;
    const user = req.session && req.session.passport && req.session.passport.user;
    if (!user) return; // unauthenticated sockets ignored
    socket.join('u:' + user);

    // presence
    io.emit('presence', { userId: user, online: true });

    socket.on('joinRoom', (roomId) => {
      socket.join('room:' + roomId);
    });

    socket.on('typing', ({ roomId, typing }) => {
      socket.to('room:' + roomId).emit('typing', { userId: user, typing });
    });

    socket.on('sendMessage', async (payload) => {
      try {
        // simple rate limit per IP
        const ip = socket.handshake.address || socket.conn.remoteAddress;
        const now = Date.now();
        const last = lastMsgAtByIp.get(ip) || 0;
        if (now - last < 500) return socket.emit('error', 'Rate limit');
        lastMsgAtByIp.set(ip, now);

        const { roomId, ciphertext, iv, keys } = payload; // keys: [{recipientId, encryptedKey}]
        const msgId = uuidv4();
        await db.query('INSERT INTO messages (id, room_id, sender_id, ciphertext, iv) VALUES ($1,$2,$3,$4,$5)', [msgId, roomId, user, ciphertext, iv]);
        for (const k of keys) {
          const kid = uuidv4();
          await db.query('INSERT INTO message_keys (id, message_id, recipient_id, encrypted_key) VALUES ($1,$2,$3,$4)', [kid, msgId, k.recipientId, k.encryptedKey]);
        }
        // broadcast to room
        io.to('room:' + roomId).emit('message', { id: msgId, roomId, senderId: user, ciphertext, iv, createdAt: new Date().toISOString(), keys });
      } catch (err) {
        console.error('sendMessage error', err);
        socket.emit('error', 'Server error');
      }
    });

    // reactions
    socket.on('react', async ({ messageId, emoji }) => {
      try {
        const rid = uuidv4();
        await db.query('INSERT INTO message_reactions (id, message_id, user_id, emoji) VALUES ($1,$2,$3,$4)', [rid, messageId, user, emoji]);
        io.to('room:' + (await (await db.query('SELECT room_id FROM messages WHERE id=$1', [messageId])).rows[0].room_id)).emit('reaction', { id: rid, messageId, userId: user, emoji });
      } catch (err) {
        console.error('react err', err);
      }
    });

    socket.on('disconnect', () => {
      io.emit('presence', { userId: user, online: false });
    });
  });

  return io;
};
