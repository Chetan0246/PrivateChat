const express = require('express');
const router = express.Router();
const db = require('./db');
const { v4: uuidv4 } = require('uuid');
const rateLimit = require('express-rate-limit');

const createLimiter = rateLimit({ windowMs: 1000, max: 2 }); // 2 requests / sec per IP for sensitive routes

// get current user
router.get('/api/me', (req, res) => {
  if (!req.user) return res.json({ user: null });
  const u = { id: req.user.id, email: req.user.email, name: req.user.name, avatar: req.user.avatar_base64, publicKey: req.user.public_key };
  res.json({ user: u });
});

// upload public key
router.post('/api/public-key', async (req, res) => {
  if (!req.user) return res.status(401).send('Unauthorized');
  const { publicKey } = req.body;
  await db.query('UPDATE users SET public_key=$1 WHERE id=$2', [publicKey, req.user.id]);
  res.json({ ok: true });
});

// get room list with last message timestamp for client-side unread badge calculation
router.get('/api/rooms', async (req, res) => {
  const q = `SELECT r.id, r.name, r.is_private, MAX(m.created_at) AS last_message_at
             FROM rooms r
             LEFT JOIN messages m ON m.room_id = r.id
             GROUP BY r.id, r.name, r.is_private
             ORDER BY r.name`;
  const r = await db.query(q);
  res.json({ rooms: r.rows });
});

// create room
router.post('/api/rooms', createLimiter, async (req, res) => {
  if (!req.user) return res.status(401).send('Unauthorized');
  const { name, is_private } = req.body;
  const id = uuidv4();
  await db.query('INSERT INTO rooms (id, name, is_private, created_by) VALUES ($1,$2,$3,$4)', [id, name, is_private || false, req.user.id]);
  // add creator as member
  await db.query('INSERT INTO room_members (room_id, user_id) VALUES ($1,$2)', [id, req.user.id]);
  res.json({ id, name });
});

// add people to room
router.post('/api/rooms/:id/add', async (req, res) => {
  if (!req.user) return res.status(401).send('Unauthorized');
  const { email } = req.body;
  const r = await db.query('SELECT id FROM users WHERE email=$1', [email]);
  if (!r.rows.length) return res.status(404).json({ error: 'User not found' });
  const userId = r.rows[0].id;
  await db.query('INSERT INTO room_members (room_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [req.params.id, userId]);
  res.json({ ok: true });
});

// get members + public keys for room
router.get('/api/rooms/:id/members', async (req, res) => {
  const r = await db.query('SELECT u.id, u.email, u.name, u.avatar_base64, u.public_key FROM users u JOIN room_members rm ON rm.user_id=u.id WHERE rm.room_id=$1', [req.params.id]);
  res.json({ members: r.rows });
});

// get messages for a room with the encrypted key for the requesting user (if any)
router.get('/api/rooms/:id/messages', async (req, res) => {
  if (!req.user) return res.status(401).send('Unauthorized');
  const roomId = req.params.id;
  const q = `SELECT m.id, m.room_id, m.sender_id, m.ciphertext, m.iv, m.created_at, mk.encrypted_key
             FROM messages m
             LEFT JOIN message_keys mk ON mk.message_id = m.id AND mk.recipient_id = $2
             WHERE m.room_id = $1
             ORDER BY m.created_at ASC`;
  const r = await db.query(q, [roomId, req.user.id]);
  res.json({ messages: r.rows });
});

// reactions for a message
router.get('/api/messages/:id/reactions', async (req, res) => {
  const r = await db.query('SELECT id, message_id, user_id, emoji, created_at FROM message_reactions WHERE message_id=$1', [req.params.id]);
  res.json({ reactions: r.rows });
});

module.exports = router;
