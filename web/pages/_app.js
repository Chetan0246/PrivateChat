import '../styles/globals.css'
import { useEffect, useState } from 'react'
import { ensureKeyPair, getPublicKey } from '../lib/crypto'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'

export default function App({ Component, pageProps }) {
  // basic theme handling
  const [theme, setTheme] = useState('system')
  useEffect(() => {
    const saved = localStorage.getItem('theme') || 'system'
    setTheme(saved)
    document.documentElement.classList.toggle('dark', saved === 'dark' || (saved === 'system' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches))

    // ensure keypair and upload public key when user is signed in
    (async () => {
      try {
        const r = await fetch(API + '/api/me', { credentials: 'include' })
        const d = await r.json()
        if (d.user) {
          await ensureKeyPair()
          const pub = await getPublicKey()
          if (pub) {
            await fetch(API + '/api/public-key', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ publicKey: pub }) })
          }
        }
      } catch (err) {
        console.error('keypair setup failed', err)
      }
    })()

  }, [])
  return <Component {...pageProps} />
}
