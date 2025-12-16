// Minimal crypto helpers using SubtleCrypto and IndexedDB for private key storage
const DB_NAME = 'privchat-keys';
const PK_STORE = 'keys';

function idbPut(key, val) {
  return new Promise((res, rej) => {
    const rq = indexedDB.open(DB_NAME, 1);
    rq.onupgradeneeded = () => rq.result.createObjectStore(PK_STORE);
    rq.onsuccess = () => {
      const tx = rq.result.transaction(PK_STORE, 'readwrite');
      tx.objectStore(PK_STORE).put(val, key);
      tx.oncomplete = () => res(true);
    };
    rq.onerror = rej;
  });
}

function idbGet(key) {
  return new Promise((res, rej) => {
    const rq = indexedDB.open(DB_NAME, 1);
    rq.onupgradeneeded = () => rq.result.createObjectStore(PK_STORE);
    rq.onsuccess = () => {
      const tx = rq.result.transaction(PK_STORE, 'readonly');
      const v = tx.objectStore(PK_STORE).get(key);
      v.onsuccess = () => res(v.result);
    };
    rq.onerror = rej;
  });
}

export async function ensureKeyPair() {
  const existing = await idbGet('privateKey');
  if (existing) return true;
  const kp = await window.crypto.subtle.generateKey({ name: 'RSA-OAEP', modulusLength: 4096, publicExponent: new Uint8Array([1,0,1]), hash: 'SHA-256' }, true, ['encrypt','decrypt']);
  const priv = await window.crypto.subtle.exportKey('pkcs8', kp.privateKey);
  const pub = await window.crypto.subtle.exportKey('spki', kp.publicKey);
  await idbPut('privateKey', arrayBufferToBase64(priv));
  await idbPut('publicKey', arrayBufferToBase64(pub));
  return true;
}

export async function getPublicKey() {
  const b64 = await idbGet('publicKey');
  return b64;
}

export async function getPrivateKey() {
  return await idbGet('privateKey');
}

export async function importPublicKey(b64) {
  const spki = base64ToArrayBuffer(b64);
  return crypto.subtle.importKey('spki', spki, { name: 'RSA-OAEP', hash: 'SHA-256' }, false, ['encrypt']);
}

export async function importPrivateKey(b64) {
  const pkcs8 = base64ToArrayBuffer(b64);
  return crypto.subtle.importKey('pkcs8', pkcs8, { name: 'RSA-OAEP', hash: 'SHA-256' }, false, ['decrypt']);
}

export async function wrapAesKey(aesKey, pubKeyB64) {
  const pub = await importPublicKey(pubKeyB64);
  const raw = await crypto.subtle.exportKey('raw', aesKey);
  const enc = await crypto.subtle.encrypt({ name: 'RSA-OAEP' }, pub, raw);
  return arrayBufferToBase64(enc);
}

export async function unwrapAesKey(b64Wrapped, privKeyB64) {
  const priv = await importPrivateKey(privKeyB64);
  const wrapped = base64ToArrayBuffer(b64Wrapped);
  const raw = await crypto.subtle.decrypt({ name: 'RSA-OAEP' }, priv, wrapped);
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['decrypt']);
}

export async function aesEncrypt(text) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const enc = new TextEncoder();
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt','decrypt']);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(text));
  return { ciphertext: arrayBufferToBase64(ct), iv: arrayBufferToBase64(iv), key };
}

export async function aesDecrypt(ciphertextB64, ivB64, aesKey) {
  const ct = base64ToArrayBuffer(ciphertextB64);
  const iv = base64ToArrayBuffer(ivB64);
  const dec = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, aesKey, ct);
  return new TextDecoder().decode(dec);
}

function arrayBufferToBase64(buf) { return btoa(String.fromCharCode(...new Uint8Array(buf))); }
function base64ToArrayBuffer(b64) { return Uint8Array.from(atob(b64), c => c.charCodeAt(0)).buffer; }
