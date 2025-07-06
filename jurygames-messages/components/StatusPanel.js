// components/StatusPanel.js
export default function StatusPanel({ logs }) {
  return (
    <div className="p-4 bg-gray-800 rounded">
      <h2 className="text-xl font-bold font-['Roboto_Condensed'] uppercase mb-2">
        🗂️ Log
      </h2>
      <ul className="text-sm text-gray-300">
        {logs.length === 0 && <li>No actions yet.</li>}
        {logs.map((log, i) => {
          const date = log.time instanceof Date
            ? log.time.toLocaleDateString('en-GB')
            : new Date(log.time).toLocaleDateString('en-GB');
          const time = log.time instanceof Date
            ? log.time.toLocaleTimeString('en-GB', { hour12: false })
            : new Date(log.time).toLocaleTimeString('en-GB', { hour12: false });
          if (log.type === 'Error') {
            return (
              <li key={i}>
                {date} {time} – Error: {log.message}
              </li>
            );
          }
          return (
            <li key={i}>
              {date} {time} – {log.type}: "{log.template}" successfully sent to {log.groupName}
            </li>
          );
        })}
      </ul>
    </div>
);
}
