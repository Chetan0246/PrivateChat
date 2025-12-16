import useSWR from 'swr'
import { useEffect, useState } from 'react'
import Sidebar from '../components/Sidebar'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'
const fetcher = (u) => fetch(API+u, { credentials: 'include' }).then(r => r.json())

export default function Home() {
  const { data } = useSWR('/api/me', fetcher)
  const [loading, setLoading] = useState(true)
  useEffect(() => { if (data) setLoading(false) }, [data])
  if (loading) return <div className="p-8">Loading...</div>
  if (!data.user) return (
    <div className="p-8">
      <h1 className="text-2xl mb-4">PrivChat</h1>
      <a className="inline-block bg-blue-600 text-white px-4 py-2 rounded" href="/auth/google">Sign in with Google</a>
      <p className="mt-4 text-sm text-gray-500">No passwords — Google OAuth only.</p>
    </div>
  )
  const [rooms, setRooms] = useState([])

  useEffect(() => { (async () => { const r = await fetch(API + '/api/rooms', { credentials: 'include' }); const j = await r.json(); setRooms(j.rooms || []) })() }, [])

  return (
    <div className="chat-layout">
      <div className="p-4 border-r">{/* Left sidebar */}
        <div className="mb-4">Signed in as {data.user.email}</div>
        <Sidebar rooms={rooms} onRefresh={() => { (async () => { const r = await fetch(API + '/api/rooms', { credentials: 'include' }); const j = await r.json(); setRooms(j.rooms || []) })() }} />
      </div>
      <div className="p-4">Select a room</div>
      <div className="p-4 border-l">Right</div>
    </div>
  )
}
