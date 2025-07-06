// pages/index.js
import Head from 'next/head';
import GroupManager from '../components/GroupManager';
import SendPanel from '../components/SendPanel';
import StatusPanel from '../components/StatusPanel';
import { useState } from 'react';

export default function Home() {
  const [groups, setGroups] = useState([]);

  return (
    <>
      <Head>
        <title>Calls & Texts | Jury Games</title>
      </Head>
      <div className="dark bg-gray-900 text-white min-h-screen p-6">
        <h1 className="text-3xl font-bold text-blue-400 mb-6">Jury Games Messaging App</h1>
        <div className="grid md:grid-cols-2 gap-6">
          <div>
            <GroupManager onGroupsChange={setGroups} />
          </div>
          <div>
            <SendPanel groups={groups} />
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
