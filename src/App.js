import { useState } from 'react';
import Auth from './components/Auth';
import Chat from './components/Chat';
import YouTubeChannelDownload from './components/YouTubeChannelDownload';
import './App.css';

function MainView({ user, onLogout }) {
  const [tab, setTab] = useState('chat');
  return (
    <div className="app-main">
      <nav className="main-tabs">
        <button
          type="button"
          className={tab === 'chat' ? 'active' : ''}
          onClick={() => setTab('chat')}
        >
          Chat
        </button>
        <button
          type="button"
          className={tab === 'yt-download' ? 'active' : ''}
          onClick={() => setTab('yt-download')}
        >
          YouTube Channel Download
        </button>
      </nav>
      {tab === 'chat' && <Chat user={user} onLogout={onLogout} />}
      {tab === 'yt-download' && <YouTubeChannelDownload />}
    </div>
  );
}

function App() {
  const [user, setUser] = useState(() => {
    try {
      const raw = localStorage.getItem('chatapp_user');
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });

  const handleLogin = (userData) => {
    const u =
      typeof userData === 'string'
        ? { username: userData, first_name: '', last_name: '' }
        : userData;
    localStorage.setItem('chatapp_user', JSON.stringify(u));
    setUser(u);
  };

  const handleLogout = () => {
    localStorage.removeItem('chatapp_user');
    setUser(null);
  };

  if (user) {
    return (
      <MainView
        user={user}
        onLogout={handleLogout}
      />
    );
  }
  return <Auth onLogin={handleLogin} />;
}

export default App;
