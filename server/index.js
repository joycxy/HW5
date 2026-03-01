/**
 * HW5 Acceptance checklist (verify before submit):
 * 1) Sign up stores first/last name; AI greets by name on first message.
 * 2) YouTube Channel Download tab works and shows progress.
 * 3) Download produces downloadable JSON.
 * 4) public/veritasium_channel_data_10.json exists (or generated via Veritasium URL, 10 videos).
 * 5) Drag/drop JSON into chat loads it and AI acknowledges.
 * 6) generateImage works with prompt + anchor image; enlarge + download.
 * 7) plot_metric_vs_time renders chart; enlarge + download.
 * 8) play_video renders clickable video card; opens new tab.
 * 9) compute_stats_json returns correct stats.
 * 10) public/prompt_chat.txt documents all tools and YouTube assistant.
 */
require('dotenv').config();
const express = require('express');
const { MongoClient, ObjectId } = require('mongodb');
const bcrypt = require('bcryptjs');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

const URI = process.env.REACT_APP_MONGODB_URI || process.env.MONGODB_URI || process.env.REACT_APP_MONGO_URI;
const DB = 'chatapp';

let db;

async function connect() {
  const client = await MongoClient.connect(URI);
  db = client.db(DB);
  console.log('MongoDB connected');
}

app.get('/', (req, res) => {
  res.send(`
    <html>
      <body style="font-family:sans-serif;padding:2rem;background:#00356b;color:white;min-height:100vh;display:flex;align-items:center;justify-content:center;margin:0">
        <div style="text-align:center">
          <h1>Chat API Server</h1>
          <p>Backend is running. Use the React app at <a href="http://localhost:3000" style="color:#ffd700">localhost:3000</a></p>
          <p><a href="/api/status" style="color:#ffd700">Check DB status</a></p>
        </div>
      </body>
    </html>
  `);
});

app.get('/api/status', async (req, res) => {
  try {
    const usersCount = await db.collection('users').countDocuments();
    const sessionsCount = await db.collection('sessions').countDocuments();
    res.json({ usersCount, sessionsCount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Users ────────────────────────────────────────────────────────────────────

app.post('/api/users', async (req, res) => {
  try {
    const { username, password, email, first_name, last_name } = req.body;
    if (!username || !password)
      return res.status(400).json({ error: 'Username and password required' });
    const first = (first_name != null && String(first_name).trim()) ? String(first_name).trim() : null;
    const last = (last_name != null && String(last_name).trim()) ? String(last_name).trim() : null;
    if (!first || !last)
      return res.status(400).json({ error: 'First name and last name required' });
    const name = String(username).trim().toLowerCase();
    const existing = await db.collection('users').findOne({ username: name });
    if (existing) return res.status(400).json({ error: 'Username already exists' });
    const hashed = await bcrypt.hash(password, 10);
    await db.collection('users').insertOne({
      username: name,
      password: hashed,
      email: email ? String(email).trim().toLowerCase() : null,
      first_name: first,
      last_name: last,
      createdAt: new Date().toISOString(),
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/users/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password)
      return res.status(400).json({ error: 'Username and password required' });
    const name = username.trim().toLowerCase();
    const user = await db.collection('users').findOne({ username: name });
    if (!user) return res.status(401).json({ error: 'User not found' });
    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.status(401).json({ error: 'Invalid password' });
    res.json({
      ok: true,
      username: name,
      first_name: user.first_name || null,
      last_name: user.last_name || null,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Sessions ─────────────────────────────────────────────────────────────────

app.get('/api/sessions', async (req, res) => {
  try {
    const { username } = req.query;
    if (!username) return res.status(400).json({ error: 'username required' });
    const sessions = await db
      .collection('sessions')
      .find({ username })
      .sort({ createdAt: -1 })
      .toArray();
    res.json(
      sessions.map((s) => ({
        id: s._id.toString(),
        agent: s.agent || null,
        title: s.title || null,
        createdAt: s.createdAt,
        messageCount: (s.messages || []).length,
      }))
    );
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/sessions', async (req, res) => {
  try {
    const { username, agent } = req.body;
    if (!username) return res.status(400).json({ error: 'username required' });
    const { title } = req.body;
    const result = await db.collection('sessions').insertOne({
      username,
      agent: agent || null,
      title: title || null,
      createdAt: new Date().toISOString(),
      messages: [],
    });
    res.json({ id: result.insertedId.toString() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/sessions/:id', async (req, res) => {
  try {
    await db.collection('sessions').deleteOne({ _id: new ObjectId(req.params.id) });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/sessions/:id/title', async (req, res) => {
  try {
    const { title } = req.body;
    await db.collection('sessions').updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: { title } }
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/sessions/:id/channel-data', async (req, res) => {
  try {
    const { channelData } = req.body;
    if (!channelData || !Array.isArray(channelData.videos))
      return res.status(400).json({ error: 'channelData with videos array required' });
    await db.collection('sessions').updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: { channelData } }
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Messages ─────────────────────────────────────────────────────────────────

app.post('/api/messages', async (req, res) => {
  try {
    const { session_id, role, content, imageData, charts, toolCalls } = req.body;
    if (!session_id || !role || content === undefined)
      return res.status(400).json({ error: 'session_id, role, content required' });
    const images = imageData ? (Array.isArray(imageData) ? imageData : [imageData]) : [];
    const imageIds = [];
    if (images.length > 0) {
      const session = await db.collection('sessions').findOne({ _id: new ObjectId(session_id) });
      const uploaded = session?.uploadedImages || [];
      images.forEach((img, i) => {
        const id = `img-${session_id}-${Date.now()}-${i}`;
        imageIds.push(id);
        uploaded.push({ id, data: img.data, mimeType: img.mimeType || 'image/png' });
      });
      await db.collection('sessions').updateOne(
        { _id: new ObjectId(session_id) },
        { $set: { uploadedImages: uploaded } }
      );
    }
    const msg = {
      role,
      content,
      timestamp: new Date().toISOString(),
      ...(images.length && { imageData: images }),
      ...(charts?.length && { charts }),
      ...(toolCalls?.length && { toolCalls }),
    };
    await db.collection('sessions').updateOne(
      { _id: new ObjectId(session_id) },
      { $push: { messages: msg } }
    );
    res.json(imageIds.length ? { ok: true, imageIds } : { ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/messages', async (req, res) => {
  try {
    const { session_id } = req.query;
    if (!session_id) return res.status(400).json({ error: 'session_id required' });
    const doc = await db
      .collection('sessions')
      .findOne({ _id: new ObjectId(session_id) });
    const raw = doc?.messages || [];
    const msgs = raw.map((m, i) => {
      const arr = m.imageData
        ? Array.isArray(m.imageData)
          ? m.imageData
          : [m.imageData]
        : [];
      return {
        id: `${doc._id}-${i}`,
        role: m.role,
        content: m.content,
        timestamp: m.timestamp,
        images: arr.length
          ? arr.map((img) => ({ data: img.data, mimeType: img.mimeType }))
          : undefined,
        charts: m.charts?.length ? m.charts : undefined,
        toolCalls: m.toolCalls?.length ? m.toolCalls : undefined,
      };
    });
    res.json(msgs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── YouTube channel download (jobs in memory; progress polling) ─────────────────

const channelJobs = new Map();

function runYtDlp(args) {
  return new Promise((resolve, reject) => {
    const proc = spawn('yt-dlp', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    proc.stdout.on('data', (d) => { out += d.toString(); });
    proc.stderr.on('data', (d) => { err += d.toString(); });
    proc.on('close', (code) => {
      if (code !== 0) reject(new Error(err || `yt-dlp exited ${code}`));
      else resolve(out);
    });
    proc.on('error', (e) => reject(e));
  });
}

async function runChannelDownload(jobId, url, maxVideos) {
  const state = channelJobs.get(jobId);
  if (!state) return;
  try {
    state.message = 'Fetching channel video list…';
    const playlistOut = await runYtDlp([
      '--flat-playlist',
      '-j',
      '--playlist-items', `1-${Math.min(maxVideos, 100)}`,
      url,
    ]);
    const lines = playlistOut.trim().split('\n').filter(Boolean);
    const entries = lines.map((l) => {
      try { return JSON.parse(l); } catch { return null; }
    }).filter(Boolean);
    const videoIds = entries
      .filter((e) => e.id || e.url)
      .map((e) => e.id || (e.url && e.url.match(/[?&]v=([^&]+)/)?.[1]))
      .filter(Boolean)
      .slice(0, maxVideos);

    state.total = videoIds.length;
    state.message = `Fetching metadata for ${videoIds.length} videos…`;
    const videos = [];
    for (let i = 0; i < videoIds.length; i++) {
      if (channelJobs.get(jobId)?.status !== 'running') break;
      state.current = i + 1;
      state.message = `Downloading ${i + 1}/${videoIds.length}…`;
      const vid = videoIds[i];
      const watchUrl = `https://www.youtube.com/watch?v=${vid}`;
      try {
        const jsonOut = await runYtDlp([
          '-j',
          '--no-download',
          '--no-warnings',
          watchUrl,
        ]);
        const meta = JSON.parse(jsonOut.trim());
        const duration = meta.duration ?? null;
        const releaseDate = meta.upload_date
          ? `${meta.upload_date.slice(0, 4)}-${meta.upload_date.slice(4, 6)}-${meta.upload_date.slice(6, 8)}`
          : null;
        videos.push({
          video_id: meta.id || vid,
          title: meta.title || null,
          description: meta.description || null,
          transcript: (meta.subtitles && Object.keys(meta.subtitles).length > 0) ? '(available)' : null,
          duration: duration,
          release_date: releaseDate,
          view_count: meta.view_count ?? null,
          like_count: meta.like_count ?? null,
          comment_count: meta.comment_count ?? null,
          video_url: meta.webpage_url || watchUrl,
          thumbnail_url: meta.thumbnail || null,
        });
      } catch (e) {
        videos.push({
          video_id: vid,
          title: null,
          description: null,
          transcript: null,
          duration: null,
          release_date: null,
          view_count: null,
          like_count: null,
          comment_count: null,
          video_url: watchUrl,
          thumbnail_url: null,
        });
      }
    }

    const channelHandle = url.match(/youtube\.com\/(@[^/]+)/)?.[1] || url.match(/\/channel\/([^/]+)/)?.[1] || null;
    const result = {
      channel_url: url,
      channel_handle: channelHandle,
      fetched_at: new Date().toISOString(),
      video_count_returned: videos.length,
      videos,
    };
    state.status = 'done';
    state.result = result;
    state.message = 'Done';

    const isVeritasium = /veritasium/i.test(url);
    if (isVeritasium && maxVideos === 10) {
      const publicDir = path.join(__dirname, '..', 'public');
      const outPath = path.join(publicDir, 'veritasium_channel_data_10.json');
      try {
        fs.writeFileSync(outPath, JSON.stringify(result, null, 2), 'utf8');
      } catch (e) {
        console.warn('Could not write veritasium_channel_data_10.json:', e.message);
      }
    }
  } catch (err) {
    state.status = 'error';
    state.error = err.message;
  }
}

app.post('/api/channel/download', async (req, res) => {
  try {
    const { url, maxVideos } = req.body;
    if (!url || typeof url !== 'string' || !url.trim())
      return res.status(400).json({ error: 'Channel URL required' });
    const max = Math.min(100, Math.max(1, parseInt(String(maxVideos), 10) || 10));
    const jobId = `job-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    channelJobs.set(jobId, {
      status: 'running',
      current: 0,
      total: max,
      message: 'Starting…',
      result: null,
      error: null,
    });
    res.json({ jobId });
    runChannelDownload(jobId, url.trim(), max);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/channel/status/:jobId', (req, res) => {
  const job = channelJobs.get(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  res.json({
    status: job.status,
    current: job.current,
    total: job.total,
    message: job.message,
    result: job.result,
    error: job.error,
  });
});

// ── YouTube / Chat tools (require session_id and session channelData or uploadedImages) ─

async function getSession(sessionId) {
  const doc = await db.collection('sessions').findOne({ _id: new ObjectId(sessionId) });
  return doc;
}

function numericValues(videos, field) {
  const key = field.replace(/\s+/g, '');
  const keys = videos.length ? Object.keys(videos[0]) : [];
  const match = keys.find((k) => k.replace(/\s+/g, '').toLowerCase() === key.toLowerCase())
    || keys.find((k) => k.toLowerCase().includes(key.toLowerCase()));
  const f = match || field;
  return videos.map((v) => (v[f] != null && v[f] !== '') ? parseFloat(v[f]) : null).filter((n) => n != null && !isNaN(n));
}

function median(sorted) {
  if (!sorted.length) return null;
  const s = [...sorted].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

app.post('/api/tools/generateImage', async (req, res) => {
  try {
    const { session_id, prompt, anchor_image_id } = req.body;
    if (!session_id || !prompt) return res.status(400).json({ error: 'session_id and prompt required' });
    const session = await getSession(session_id);
    let anchorB64 = null;
    let mimeType = 'image/png';
    if (anchor_image_id && session?.uploadedImages?.length) {
      const img = session.uploadedImages.find((i) => i.id === anchor_image_id);
      if (img) { anchorB64 = img.data; mimeType = img.mimeType || 'image/png'; }
    }
    const openaiKey = process.env.OPENAI_API_KEY || process.env.REACT_APP_OPENAI_API_KEY;
    if (openaiKey) {
      const response = await fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${openaiKey}`,
        },
        body: JSON.stringify({
          model: 'dall-e-3',
          prompt: String(prompt).slice(0, 4000),
          n: 1,
          size: '1024x1024',
          response_format: 'b64_json',
        }),
      });
      const data = await response.json();
      if (data.error) throw new Error(data.error.message || 'OpenAI error');
      const b64 = data.data?.[0]?.b64_json;
      if (!b64) throw new Error('No image in response');
      return res.json({
        image_url: `data:image/png;base64,${b64}`,
        mime_type: 'image/png',
      });
    }
    if (anchorB64) {
      return res.json({
        image_url: `data:${mimeType};base64,${anchorB64}`,
        mime_type: mimeType,
        note: 'OPENAI_API_KEY not set; returning anchor image. Set OPENAI_API_KEY for generation.',
      });
    }
    return res.status(400).json({ error: 'Set OPENAI_API_KEY for image generation, or attach an image as anchor.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/tools/plot_metric_vs_time', async (req, res) => {
  try {
    const { session_id, metric } = req.body;
    if (!session_id || !metric) return res.status(400).json({ error: 'session_id and metric required' });
    const session = await getSession(session_id);
    const videos = session?.channelData?.videos;
    if (!videos?.length) return res.status(400).json({ error: 'No channel data in session' });
    const field = metric.replace(/\s+/g, '');
    const keys = Object.keys(videos[0]);
    const match = keys.find((k) => k.replace(/\s+/g, '').toLowerCase() === field.toLowerCase())
      || keys.find((k) => /view_count|like_count|comment_count|duration/i.test(k) && k.toLowerCase().includes(field.toLowerCase()));
    const f = match || metric;
    const withDate = videos
      .map((v) => {
        const t = v.release_date || v.upload_date;
        const y = v[f] != null && v[f] !== '' ? parseFloat(v[f]) : null;
        return { t, y, title: v.title || '', video_url: v.video_url || '' };
      })
      .filter((p) => p.t && p.y != null && !isNaN(p.y))
      .sort((a, b) => String(a.t).localeCompare(String(b.t)));
    return res.json({
      metric: f,
      points: withDate,
      x_label: 'Release date',
      y_label: f,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/tools/play_video', async (req, res) => {
  try {
    const { session_id, query } = req.body;
    if (!session_id || query === undefined) return res.status(400).json({ error: 'session_id and query required' });
    const session = await getSession(session_id);
    const videos = session?.channelData?.videos;
    if (!videos?.length) return res.status(400).json({ error: 'No channel data in session' });
    const q = String(query).toLowerCase().trim();
    let chosen = null;
    if (/most viewed|most views|highest view/i.test(q)) {
      const sorted = [...videos].sort((a, b) => (parseFloat(b.view_count) || 0) - (parseFloat(a.view_count) || 0));
      chosen = sorted[0];
    } else if (/first|1st|^1$/i.test(q)) {
      const byDate = [...videos].sort((a, b) => String(a.release_date || '').localeCompare(String(b.release_date || '')));
      chosen = byDate[0];
    } else if (/second|2nd|^2$/i.test(q)) {
      const byDate = [...videos].sort((a, b) => String(a.release_date || '').localeCompare(String(b.release_date || '')));
      chosen = byDate[1];
    } else if (/^\d+$/.test(q)) {
      const idx = parseInt(q, 10);
      chosen = videos[idx - 1] || videos[0];
    } else {
      const scored = videos.map((v) => {
        const title = (v.title || '').toLowerCase();
        const match = title.includes(q) ? 2 : (title.split(/\s+/).some((w) => w.startsWith(q) || q.startsWith(w)) ? 1 : 0);
        return { v, match };
      });
      scored.sort((a, b) => b.match - a.match);
      chosen = scored[0]?.v || videos[0];
    }
    if (!chosen) chosen = videos[0];
    return res.json({
      title: chosen.title || '',
      thumbnail_url: chosen.thumbnail_url || '',
      video_url: chosen.video_url || `https://www.youtube.com/watch?v=${chosen.video_id}`,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/tools/compute_stats_json', async (req, res) => {
  try {
    const { session_id, field } = req.body;
    if (!session_id || !field) return res.status(400).json({ error: 'session_id and field required' });
    const session = await getSession(session_id);
    const videos = session?.channelData?.videos;
    if (!videos?.length) return res.status(400).json({ error: 'No channel data in session' });
    const vals = numericValues(videos, field);
    const nullCount = videos.length - vals.length;
    if (vals.length === 0) {
      return res.json({
        field,
        count: 0,
        null_count: nullCount,
        mean: null,
        median: null,
        std: null,
        min: null,
        max: null,
      });
    }
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    const sorted = [...vals].sort((a, b) => a - b);
    const variance = vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length;
    const std = Math.sqrt(variance);
    return res.json({
      field,
      count: vals.length,
      null_count: nullCount,
      mean: +mean.toFixed(4),
      median: +median(sorted).toFixed(4),
      std: +std.toFixed(4),
      min: Math.min(...vals),
      max: Math.max(...vals),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3001;

connect()
  .then(() => {
    app.listen(PORT, () => console.log(`Server on http://localhost:${PORT}`));
  })
  .catch((err) => {
    console.error('MongoDB connection failed:', err.message);
    process.exit(1);
  });
