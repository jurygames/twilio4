
// pages/index.js
import Head from 'next/head';
import Link from 'next/link';
import GroupManager from '../components/GroupManager';
import SendPanel from '../components/SendPanel';
import StatusPanel from '../components/StatusPanel';
import { useState } from 'react';

export default function Home() {
  const [groups, setGroups] = useState([]);
  const [logs, setLogs] = useState([]);

  return (
    <>
      <Head>
        <title>Calls & Texts | Jury Games</title>
      </Head>
      <div className="dark bg-gray-900 text-white min-h-screen">
        <header className="bg-[#333F50] py-6 flex items-center justify-center">
          <h1 className="text-5xl font-bold font-['Roboto_Condensed'] uppercase text-white">
            Jury Games
          </h1>
        </header>
        <main className="p-6 grid md:grid-cols-2 gap-6">
          <div>
            <GroupManager onGroupsChange={setGroups} />
          </div>
          <div>
            <SendPanel groups={groups} onLog={entry => setLogs([entry, ...logs])} />
            <StatusPanel logs={logs} />
          </div>
        </main>
        <div className="p-6 flex justify-center">
          <Link href="/admin">
            <button className="bg-gray-800 hover:bg-gray-700 text-white px-4 py-2 rounded inline-flex items-center">
              <span className="mr-2">🔧</span>
              Manage Templates
            </button>
          </Link>
        </div>
      </div>
    </>
  );
}
