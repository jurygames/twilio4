// pages/_app.js
import '../styles/globals.css';
import { useState, useEffect } from 'react';

function MyApp({ Component, pageProps }) {
  const [authenticated, setAuthenticated] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined' && localStorage.getItem('authenticated') === 'true') {
      setAuthenticated(true);
    }
  }, []);

  const handleLogin = (e) => {
    e.preventDefault();
    const password = e.target.password.value;
    if (password === 'HangHim2025') {
      localStorage.setItem('authenticated', 'true');
      setAuthenticated(true);
    } else {
      alert('Incorrect password');
    }
  };

  if (!authenticated) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-900">
        <form onSubmit={handleLogin} className="bg-gray-800 p-6 rounded">
          <h1 className="text-white text-xl mb-4">Enter Password</h1>
          <input
            type="password"
            name="password"
            className="w-full p-2 mb-4 bg-gray-700 text-white rounded"
            placeholder="Password"
          />
          <button type="submit" className="w-full bg-blue-500 text-white p-2 rounded">
            Login
          </button>
        </form>
      </div>
    );
  }

  return <Component {...pageProps} />;
}

export default MyApp;
