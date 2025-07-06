// pages/admin.js
import Head from 'next/head';
import Link from 'next/link';
import TemplateManager from '../components/TemplateManager';
import { useState, useEffect } from 'react';

export default function Admin() {
  const [authenticated, setAuthenticated] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setAuthenticated(localStorage.getItem('adminAuth') === 'true');
    }
  }, []);

  const handleLogin = (e) => {
    e.preventDefault();
    const password = e.target.password.value;
    if (password === 'HangHim2025') {
      localStorage.setItem('adminAuth', 'true');
      setAuthenticated(true);
    } else {
      alert('Incorrect password');
    }
  };

  if (!authenticated) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-900">
        <form onSubmit={handleLogin} className="bg-gray-800 p-6 rounded">
          <h1 className="text-white text-xl mb-4">Admin Password</h1>
          <input
            type="password"
            name="password"
            className="w-full p-2 mb-4 bg-gray-700 text-white rounded"
            placeholder="Enter password"
          />
          <button type="submit" className="w-full bg-blue-500 text-white p-2 rounded">
            Login
          </button>
        </form>
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>Template Management | Jury Games</title>
        <link rel="icon" type="image/png" href="/favicon.png" />
      </Head>
      <div className="dark bg-gray-900 text-white min-h-screen">
        <header className="bg-[#333F50] py-6 flex items-center justify-center space-x-4">
          <img src="/favicon.png" alt="Jury Games Logo" className="h-8 filter invert" />
          <h1 className="text-3xl font-bold font-['Roboto_Condensed'] uppercase text-white">
            Template Management
          </h1>
        </header>
        <main className="p-6">
          <div className="mb-6">
            <Link href="/">
              <a className="px-3 py-1 bg-gray-800 hover:bg-gray-700 rounded text-sm inline-flex items-center">
                <span className="mr-2">←</span>
                Back to Send
              </a>
            </Link>
          </div>
          <TemplateManager />
        </main>
      </div>
    </>
  );
}
