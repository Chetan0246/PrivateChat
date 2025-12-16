export default function MessageInput({ value, onChange, onSend }) {
  return (
    <div className="mt-2 flex">
      <input value={value} onChange={e=>onChange(e.target.value)} className="flex-1 border p-2" placeholder="Message..." />
      <button onClick={onSend} className="ml-2 bg-blue-600 text-white px-4">Send</button>
    </div>
  )
}
