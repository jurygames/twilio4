
import ShowSelector from '../components/ShowSelector';
import GroupManager from '../components/GroupManager';
import TemplateManager from '../components/TemplateManager';
import SendPanel from '../components/SendPanel';
import StatusPanel from '../components/StatusPanel';

export default function Home() {
  return (
    <div className="dark bg-gray-900 text-white min-h-screen p-6">
      <h1 className="text-3xl font-bold text-blue-400 mb-6">Jury Games Messaging App</h1>
      <div className="grid md:grid-cols-2 gap-6">
        <div>
          <ShowSelector />
          <GroupManager />
          <TemplateManager />
        </div>
        <div>
          <SendPanel />
          <StatusPanel />
        </div>
      </div>
    </div>
  );
}
