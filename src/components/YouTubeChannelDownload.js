import { useState, useCallback, useEffect } from 'react';
import './YouTubeChannelDownload.css';

const API = process.env.REACT_APP_API_URL || '';

export default function YouTubeChannelDownload() {
  const [url, setUrl] = useState('https://www.youtube.com/@veritasium');
  const [maxVideos, setMaxVideos] = useState(10);
  const [jobId, setJobId] = useState(null);
  const [status, setStatus] = useState(null);
  const [error, setError] = useState('');

  const startDownload = useCallback(async () => {
    setError('');
    setJobId(null);
    setStatus(null);
    try {
      const res = await fetch(`${API}/api/channel/download`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: url.trim(),
          maxVideos: Math.min(100, Math.max(1, maxVideos)),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Download failed');
      setJobId(data.jobId);
    } catch (e) {
      setError(e.message);
    }
  }, [url, maxVideos]);

  const pollStatus = useCallback(async () => {
    if (!jobId) return;
    try {
      const res = await fetch(`${API}/api/channel/status/${jobId}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Status failed');
      setStatus(data);
    } catch (e) {
      setStatus((s) => (s ? { ...s, status: 'error', error: e.message } : null));
    }
  }, [jobId]);

  useEffect(() => {
    if (!jobId) return;
    pollStatus();
  }, [jobId, pollStatus]);

  useEffect(() => {
    if (!jobId || !status || status.status !== 'running') return;
    const t = setInterval(pollStatus, 800);
    return () => clearInterval(t);
  }, [jobId, status?.status, pollStatus]);

  const result = status?.result;
  const progress = status?.total ? Math.round(((status.current || 0) / status.total) * 100) : 0;

  const downloadJson = () => {
    if (!result) return;
    const blob = new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'channel_data.json';
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="yt-download-page">
      <div className="yt-download-card">
        <h1 className="yt-download-title">YouTube Channel Download</h1>
        <p className="yt-download-desc">Enter a YouTube channel URL to download video metadata as JSON.</p>

        <div className="yt-download-form">
          <label>
            Channel URL
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://www.youtube.com/@channelname"
            />
          </label>
          <label>
            Max videos (1–100)
            <input
              type="number"
              min={1}
              max={100}
              value={maxVideos}
              onChange={(e) => setMaxVideos(Number(e.target.value) || 10)}
            />
          </label>
          <button
            type="button"
            className="yt-download-btn"
            onClick={startDownload}
            disabled={!!(jobId && status?.status === 'running')}
          >
            Download Channel Data
          </button>
        </div>

        {error && <p className="yt-download-error">{error}</p>}

        {status?.status === 'running' && (
          <div className="yt-download-progress">
            <div className="yt-progress-bar">
              <div className="yt-progress-fill" style={{ width: `${progress}%` }} />
            </div>
            <p className="yt-progress-text">{status.message || `Downloading ${status.current || 0}/${status.total}…`}</p>
          </div>
        )}

        {status?.status === 'error' && (
          <p className="yt-download-error">Error: {status.error}. Make sure yt-dlp is installed (e.g. brew install yt-dlp).</p>
        )}

        {status?.status === 'done' && result && (
          <div className="yt-download-done">
            <button type="button" className="yt-download-json-btn" onClick={downloadJson}>
              Download JSON
            </button>
            <p className="yt-download-preview-label">Preview ({result.videos?.length || 0} videos)</p>
            <ul className="yt-download-preview-list">
              {(result.videos || []).slice(0, 15).map((v, i) => (
                <li key={v.video_id || i}>
                  <span className="yt-preview-title">{v.title || '(no title)'}</span>
                  <span className="yt-preview-views">{v.view_count != null ? `${Number(v.view_count).toLocaleString()} views` : '—'}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
