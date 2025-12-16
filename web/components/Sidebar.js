const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'

export default function Sidebar({ rooms=[], onRefresh }) {
  async function createRoom() {
    const name = prompt('Room name')
    if (!name) return;
    const isPrivate = confirm('Make private? OK = private')
    await fetch(API + '/api/rooms', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, is_private: isPrivate }) })
    onRefresh && onRefresh()
  }

  function lastSeenAt(roomId) {
    return localStorage.getItem('lastSeen:' + roomId)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg">Rooms</h2>
        <div className="flex gap-2">
          <button onClick={() => {
            const cur = localStorage.getItem('theme') || 'system'
            const next = cur === 'dark' ? 'light' : 'dark'
            localStorage.setItem('theme', next); document.documentElement.classList.toggle('dark', next === 'dark')
          }} className="px-2 py-1 bg-gray-200 rounded">Theme</button>
          <button onClick={createRoom} className="text-sm px-2 py-1 bg-gray-200 rounded">+ New</button>
        </div>
      </div>
      <ul>
        {rooms.map(r => {
          const last = r.last_message_at && Date.parse(r.last_message_at)
          const seen = lastSeenAt(r.id) && Date.parse(lastSeenAt(r.id))
          const unread = last && (!seen || last > seen)
          return (
            <li key={r.id} className="p-2 hover:bg-gray-100 rounded flex justify-between items-center">
              <a href={`/chat/${r.id}`} className="flex-1">{r.name}</a>
              {unread ? <span className="bg-blue-500 text-white rounded-full px-2 text-xs">•</span> : <span className="text-xs text-gray-400"> </span>}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
