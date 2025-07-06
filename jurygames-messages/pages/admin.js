// pages/admin.js
import Head from 'next/head';
import TemplateManager from '../components/TemplateManager';
import Link from 'next/link';

export default function Admin() {
  return (
    <>
      <Head>
        <title>Admin – Manage Templates | Jury Games</title>
      </Head>
      <div className="dark bg-gray-900 text-white min-h-screen p-6">
        <div className="flex items-center mb-6">
          <Link href="/">
            <a className="px-3 py-1 bg-gray-800 hover:bg-gray-700 rounded text-sm mr-4">
              ← Back
            </a>
          </Link>
          <h1 className="text-3xl font-bold text-blue-400">Template Management</h1>
        </div>
        <TemplateManager />
      </div>
    </>
  );
}
