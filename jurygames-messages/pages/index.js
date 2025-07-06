
// pages/index.js
import Head from 'next/head';
import { useState } from 'react';
import ShowSelector from '../components/ShowSelector';
import GroupManager from '../components/GroupManager';
import SendPanel from '../components/SendPanel';
import StatusPanel from '../components/StatusPanel';
import templatesData from '../data/templates.js';

export default function Home() {
  const [selectedShow, setSelectedShow] = useState('Scott Davies');
  const [groups, setGroups] = useState([]);

  const templates = templatesData.filter(t => t.show === selectedShow);

  return (
    <>
      <Head>
        <title>Calls & Texts | Jury Games</title>
      </Head>
      <div className="dark bg-gray-900 text-white min-h-screen p-6">
        <h1 className="text-3xl font-bold text-blue-400 mb-6">Jury Games Messaging App</h1>
        <div className="grid md:grid-cols-2 gap-6">
          <div>
            <ShowSelector onSelect={setSelectedShow} />
            <GroupManager onGroupsChange={setGroups} />
          </div>
          <div>
            <SendPanel groups={groups} templates={templates} />
            <StatusPanel />
          </div>
        </div>
        <div className="mt-6">
          <a href="/admin" className="text-sm text-blue-400 hover:underline">
            Admin: Manage Templates
          </a>
        </div>
      </div>
    </>
  );
}
