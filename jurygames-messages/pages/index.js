import Head from 'next/head';
import Link from 'next/link';
import MessagingDashboard from '../components/MessagingDashboard';
import SessionGate from '../components/SessionGate';

export default function Home() {
  return (
    <SessionGate requiredRole="operator">
      {({ role, canSend }) => (
        <>
          <Head>
            <title>Calls & Texts | Jury Games</title>
            <link rel="icon" type="image/png" href="/favicon.png" />
          </Head>
          <div className="dark min-h-screen bg-gray-900 text-white">
            <header className="flex items-center justify-center space-x-4 bg-[#333F50] py-6">
              <img src="/favicon.png" alt="Jury Games Logo" className="h-8 filter invert" />
              <h1 className="font-['Roboto_Condensed'] text-4xl font-bold uppercase text-white">Jury Games Messaging</h1>
            </header>
            <main className="mx-auto max-w-7xl space-y-4 p-4 md:p-6">
              {role === 'admin' ? (
                <div className="flex justify-end">
                  <Link href="/admin" className="inline-flex items-center rounded bg-gray-800 px-4 py-2 text-sm text-white hover:bg-gray-700">
                    Manage Templates
                  </Link>
                </div>
              ) : null}
              <MessagingDashboard canSend={canSend} />
            </main>
          </div>
        </>
      )}
    </SessionGate>
  );
}
