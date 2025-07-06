// components/StatusPanel.js
export default function StatusPanel({ logs }) {
  return (
    <div className="p-4 bg-gray-800 rounded">
      <h2 className="text-xl font-semibold mb-2">🗂️ Log</h2>
      <ul className="text-sm text-gray-300">
        {logs.length === 0 && <li>No actions yet.</li>}
        {logs.map((log, i) => (
          <li key={i}>
            {log.time.toLocaleTimeString()} – {log.type}
            {log.template ? `: "${log.template}" (${log.count})` : log.message}
          </li>
        ))}
      </ul>
    </div>
);
}
