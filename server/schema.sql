-- Users
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  avatar_base64 TEXT,
  public_key TEXT,
  created_at TIMESTAMP DEFAULT now()
);

-- Rooms
CREATE TABLE IF NOT EXISTS rooms (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  is_private BOOLEAN DEFAULT FALSE,
  created_by UUID,
  created_at TIMESTAMP DEFAULT now()
);

-- Room members
CREATE TABLE IF NOT EXISTS room_members (
  room_id UUID REFERENCES rooms(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (room_id, user_id)
);

-- Messages
CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY,
  room_id UUID REFERENCES rooms(id) ON DELETE CASCADE,
  sender_id UUID REFERENCES users(id) ON DELETE SET NULL,
  ciphertext TEXT NOT NULL,
  iv TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT now()
);

-- Message keys: per-recipient AES key wrapped with recipient's public key
CREATE TABLE IF NOT EXISTS message_keys (
  id UUID PRIMARY KEY,
  message_id UUID REFERENCES messages(id) ON DELETE CASCADE,
  recipient_id UUID REFERENCES users(id) ON DELETE CASCADE,
  encrypted_key TEXT NOT NULL
);

-- Message reactions (simple emoji per user)
CREATE TABLE IF NOT EXISTS message_reactions (
  id UUID PRIMARY KEY,
  message_id UUID REFERENCES messages(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  emoji TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT now()
);
