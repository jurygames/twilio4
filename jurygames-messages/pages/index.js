// pages/index.js
import Head from 'next/head';
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
          <h1 style={{ fontFamily: "'Roboto Condensed', sans-serif", fontWeight: 700 }} className="text-3xl uppercase text-white">
            JURY GAMES
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
      </div>
    </>
  );
}
