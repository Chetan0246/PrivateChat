import { useRouter } from 'next/router'
import { useEffect, useState, useRef } from 'react'
import io from 'socket.io-client'
import { ensureKeyPair, getPrivateKey, aesEncrypt, wrapAesKey, unwrapAesKey, aesDecrypt } from '../../lib/crypto'

let socket;

export default function Room() {
  const router = useRouter();
  const { roomId } = router.query;
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [me, setMe] = useState(null);
  const [members, setMembers] = useState([]);
  const [typingUsers, setTypingUsers] = useState({});
  const [presence, setPresence] = useState({});
  const [reactionsMap, setReactionsMap] = useState({});
  const typingTimeoutRef = useRef(null);

  const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'

  useEffect(() => {
    (async () => {
      const r = await fetch(API + '/api/me', { credentials: 'include' });
      const d = await r.json();
      setMe(d.user);
      // ensure keypair exists locally
      try { await ensureKeyPair(); } catch (err) { console.error('ensureKey', err); }
    })();
  }, []);

  // load room members and messages
  useEffect(() => {
    if (!roomId) return;
    (async () => {
      try {
        const mres = await fetch(API + '/api/rooms/' + roomId + '/members', { credentials: 'include' });
        const md = await mres.json();
        setMembers(md.members || []);

        const r = await fetch(API + '/api/rooms/' + roomId + '/messages', { credentials: 'include' });
        const jd = await r.json();
        const priv = await getPrivateKey();
        const out = [];
        for (const msg of jd.messages) {
          let plaintext = null;
          try {
            if (msg.encrypted_key && priv) {
              const aesKey = await unwrapAesKey(msg.encrypted_key, priv);
              plaintext = await aesDecrypt(msg.ciphertext, msg.iv, aesKey);
            }
          } catch (err) {
            // decrypt failed
            plaintext = null;
          }
          out.push({ ...msg, plaintext });
        }
        setMessages(out);

        // fetch reactions for messages
        for (const msg of out) {
          try {
            const rr = await fetch(API + '/api/messages/' + msg.id + '/reactions', { credentials: 'include' });
            const rj = await rr.json();
            setReactionsMap(prev => ({ ...prev, [msg.id]: rj.reactions || [] }));
          } catch (e) { /* ignore */ }
        }

        // mark lastSeen for unread computation
        if (out.length) {
          const last = out[out.length - 1].created_at || out[out.length - 1].createdAt;
          last && localStorage.setItem('lastSeen:' + roomId, last);
        }
      } catch (err) {
        console.error('load messages error', err);
      }
    })();
  }, [roomId]);

  useEffect(() => {
    if (!roomId) return;
    if (!socket) socket = io(API, { withCredentials: true });
    socket.emit('joinRoom', roomId);

    socket.on('message', async (m) => {
      // on incoming message, try to find key for me
      try {
        let plaintext = null;
        const priv = await getPrivateKey();
        let encKey = null;
        if (m.keys && m.keys.length && priv) {
          const meKey = m.keys.find(k => k.recipientId === (me && me.id));
          if (meKey) encKey = meKey.encryptedKey;
        }
        if (!encKey && m.encrypted_key) encKey = m.encrypted_key; // fallback
        if (encKey && priv) {
          const aesKey = await unwrapAesKey(encKey, priv);
          plaintext = await aesDecrypt(m.ciphertext, m.iv, aesKey);
        }
        setMessages((s) => [...s, { ...m, plaintext }]);
      } catch (err) {
        console.error('decrypt incoming', err);
        setMessages((s) => [...s, m]);
      }
    });

    socket.on('typing', ({ userId, typing }) => {
      setTypingUsers(prev => ({ ...prev, [userId]: typing }));
    });

    socket.on('presence', ({ userId, online }) => {
      setPresence(prev => ({ ...prev, [userId]: online }));
    });

    socket.on('reaction', ({ id, messageId, userId, emoji }) => {
      setReactionsMap(prev => {
        const arr = prev[messageId] ? [...prev[messageId]] : [];
        arr.push({ id, messageId, user_id: userId, emoji });
        return { ...prev, [messageId]: arr };
      });
    });

    return () => {
      socket.off('message');
      socket.off('typing');
      socket.off('presence');
    };
  }, [roomId, me]);

  async function send() {
    if (!text.trim()) return;
    // support `/me` command
    let outgoing = text;
    if (outgoing.startsWith('/me ')) {
      outgoing = '*' + outgoing.slice(4) + '*'; // simple italics marker
    }

    const { ciphertext, iv, key } = await aesEncrypt(outgoing);

    // wrap AES key for all members who have public_key
    const keys = [];
    for (const m of members) {
      if (!m.public_key) continue;
      try {
        const wrapped = await wrapAesKey(key, m.public_key);
        keys.push({ recipientId: m.id, encryptedKey: wrapped });
      } catch (err) {
        console.warn('wrap for member failed', m.id, err);
      }
    }

    socket.emit('sendMessage', { roomId, ciphertext, iv, keys });

    // optimistic append (we can decrypt locally since we wrapped for ourselves)
    try {
      const priv = await getPrivateKey();
      const meWrap = keys.find(k => k.recipientId === (me && me.id));
      let plaintext = null;
      if (meWrap) {
        const aesKey = await unwrapAesKey(meWrap.encryptedKey, priv);
        plaintext = await aesDecrypt(ciphertext, iv, aesKey);
      }
      const pseudoId = 'local-' + Date.now();
      setMessages(s => [...s, { id: pseudoId, senderId: me && me.id, roomId, ciphertext, iv, plaintext, createdAt: new Date().toISOString() }]);
    } catch (err) {
      console.warn('local decrypt failed', err);
    }

    setText('');
    socket.emit('typing', { roomId, typing: false });
  }

  // typing indicator handling
  function handleChange(e) {
    setText(e.target.value);
    socket && socket.emit('typing', { roomId, typing: true });
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => { socket && socket.emit('typing', { roomId, typing: false }); }, 2000);
  }

  return (
    <div className="chat-layout">
      <div className="p-4 border-r">
        {/* Sidebar: show members with presence */}
        <div className="mb-4">Members</div>
        <ul>
          {members.map(m => (
            <li key={m.id} className="flex items-center justify-between py-1">
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${presence[m.id] ? 'bg-green-400' : 'bg-gray-300'}`} />
                <span>{m.name || m.email}</span>
              </div>
              <span className="text-xs text-gray-500">{m.email}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="p-4 flex flex-col">
        <div className="flex-1 overflow-auto border p-2">
          {messages.map(m => (
            <div key={m.id} className="mb-2">
              <div className="text-xs text-gray-500">{m.senderId} • {new Date(m.createdAt).toLocaleTimeString()}</div>
              <div className="p-2 rounded bg-white dark:bg-gray-800">{m.plaintext ?? '[encrypted message]'}</div>
              <div className="mt-1 flex gap-2 items-center text-sm">
                {(reactionsMap[m.id] || []).map(r => <span key={r.id} className="px-1">{r.emoji}</span>)}
                <div className="flex gap-1">
                  {['👍','❤️','😂','🎉'].map(emoji => <button key={emoji} onClick={() => socket && socket.emit('react', { messageId: m.id, emoji })} className="text-xs px-1">{emoji}</button>)}
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-2 flex items-center gap-2">
          <input value={text} onChange={handleChange} className="flex-1 border p-2" placeholder="Message"/>
          <button onClick={send} className="ml-2 bg-blue-600 text-white px-4">Send</button>
        </div>
        <div className="mt-2 text-sm text-gray-500">
          {Object.keys(typingUsers).filter(id => typingUsers[id]).map(id => <span key={id}>{id} is typing…</span>)}
        </div>
      </div>
      <div className="p-4 border-l">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <span className="font-semibold">About</span>
            <span title="End-to-end encrypted" className="text-xs text-gray-400">🔒</span>
          </div>
        </div>
        <div className="mb-4">
          <button className="px-3 py-1 bg-gray-200 rounded" onClick={async () => {
            const email = prompt('Email to add')
            if (!email) return
            await fetch(API + '/api/rooms/' + roomId + '/add', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) })
            // refresh members list
            const mres = await fetch(API + '/api/rooms/' + roomId + '/members', { credentials: 'include' });
            const md = await mres.json();
            setMembers(md.members || [])
          }}>Add people</button>
        </div>
        <div>
          <h4 className="text-sm font-medium">Members</h4>
          <ul className="mt-2">
            {members.map(m => <li key={m.id} className="text-sm py-1">{m.name || m.email} <span className="text-xs text-gray-400">{presence[m.id] ? ' • online' : ''}</span></li>)}
          </ul>
        </div>
      </div>
    </div>
  )
}
