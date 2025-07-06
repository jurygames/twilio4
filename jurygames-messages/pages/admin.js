// pages/admin.js
import TemplateManager from '../components/TemplateManager';

export default function Admin() {
  return (
    <div className="dark bg-gray-900 text-white min-h-screen p-6">
      <h1 className="text-3xl font-bold text-blue-400 mb-6">Admin – Template Management</h1>
      <TemplateManager />
    </div>
  );
}
