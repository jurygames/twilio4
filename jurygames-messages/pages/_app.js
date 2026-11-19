// pages/_app.js
import '../styles/globals.css';
import { useEffect } from 'react';

function MyApp({ Component, pageProps }) {
  useEffect(() => {
    // Remove recipient lists and client-only password flags written by older builds.
    try {
      for (const key of ['groups', 'authenticated', 'adminAuth']) window.localStorage.removeItem(key);
    } catch {
      // If browser storage is unavailable, the new app never writes recipient data to it.
    }
  }, []);
  return <Component {...pageProps} />;
}

export default MyApp;
