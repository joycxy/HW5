# YouTube AI Chat Assistant (HW5)

A React chatbot with Gemini AI, built on the original class chat app. Adds **YouTube channel analysis**: download channel metadata as JSON, drag-and-drop JSON into chat, and use four AI tools — generate image, plot metric vs time, play video, compute stats. Includes user auth (first/last name), MongoDB persistence, CSV upload, and streaming responses with a glassmorphism UI.

## Changes from the original chat app (HW5)

This repo started from the class “chat app” and was extended as follows:

| Area | Change |
|------|--------|
| **Auth** | Create Account form now has **First name** and **Last name** (required). Stored in DB; returned on login. |
| **Personalization** | AI is instructed to **greet the user by name** in the first message of each conversation (e.g. “Hi Joy Chen…”). |
| **New tab** | **“YouTube Channel Download”** (visible when logged in). User enters a channel URL and max videos (1–100). Downloads metadata as JSON with progress bar; “Download JSON” and video preview list. |
| **Public sample** | Running download for `https://www.youtube.com/@veritasium` with 10 videos can write **`public/veritasium_channel_data_10.json`** for graders. |
| **JSON in chat** | **Drag-and-drop `.json`** (channel data) into chat. Validates `videos` array; shows “Loaded channel data: N videos” chip. Stored in session on server so tools can use it. |
| **Four required tools** | All implemented with **exact names** for grading: **`generateImage`** (prompt + optional anchor image; enlarge + download), **`plot_metric_vs_time`** (metric vs release date chart; enlarge + download), **`play_video`** (query → clickable card, opens YouTube in new tab), **`compute_stats_json`** (mean, median, std, min, max for a numeric field). Tools run on the server; definitions and docs live in **`public/prompt_chat.txt`**. |
| **System prompt** | **`public/prompt_chat.txt`** updated to a YouTube analysis assistant: knows about channel JSON, documents all four tools (name, purpose, args, when to use, return value), and prefers tool calls over hallucinating numbers. |
| **Backend** | New routes: `POST/GET` channel download (yt-dlp), `POST` session channel-data, `POST` tools: `generateImage`, `plot_metric_vs_time`, `play_video`, `compute_stats_json`. Messages can store `imageData`; sessions store `channelData` and `uploadedImages` for tools. |
| **Deploy** | **`render.yaml`** Blueprint with unique service names; **`DEPLOY_RENDER.md`** has full Render steps and “name in use” workaround (manual deploy without Blueprint). |

Optional env: **`OPENAI_API_KEY`** (or `REACT_APP_OPENAI_API_KEY`) for **`generateImage`** (DALL-E 3). If unset, anchor image is returned when provided.

## How It Works

- **Frontend (React)** – Login/create account (first + last name), Chat + YouTube Channel Download tabs, chat UI with streaming, drag-and-drop CSV/JSON/images, Recharts charts, tool result UI (image, chart, video card, stats)
- **Backend (Express)** – REST API for users, sessions, messages, channel download (yt-dlp), session channel-data, and four tool endpoints (`generateImage`, `plot_metric_vs_time`, `play_video`, `compute_stats_json`)
- **AI (Gemini)** – Streaming chat, Google Search grounding, Python code execution, client-side CSV tools, and server-side YouTube tools (exact names above)
- **Storage (MongoDB)** – Users (with first_name, last_name), sessions (messages, channelData, uploadedImages) in `chatapp` database

## API Keys & Environment Variables

Create a `.env` file in the project root with:

| Variable | Required | Where used | Description |
|----------|----------|------------|-------------|
| `REACT_APP_GEMINI_API_KEY` | Yes | Frontend (baked in at build) | Google Gemini API key. Get one at [Google AI Studio](https://aistudio.google.com/apikey). |
| `REACT_APP_MONGODB_URI` | Yes | Backend | MongoDB Atlas connection string. Format: `mongodb+srv://USER:PASSWORD@CLUSTER.mongodb.net/` |
| `REACT_APP_API_URL` | Production only | Frontend (baked in at build) | Full URL of the backend, e.g. `https://your-backend.onrender.com`. Leave blank for local dev (proxy handles it). |

The backend also accepts `MONGODB_URI` or `REACT_APP_MONGO_URI` as the MongoDB connection string if you prefer those names.

### Example `.env` (local development)

```
REACT_APP_GEMINI_API_KEY=AIzaSy...
REACT_APP_MONGODB_URI=mongodb+srv://user:password@cluster.mongodb.net/
# REACT_APP_API_URL not needed locally — the dev server proxies /api to localhost:3001
```

## MongoDB Setup

1. Create a [MongoDB Atlas](https://www.mongodb.com/cloud/atlas) account and cluster.
2. Get your connection string (Database → Connect → Drivers).
3. Put it in `.env` as `REACT_APP_MONGODB_URI`.

All collections are created automatically on first use.

### Database: `chatapp`

#### Collection: `users`

One document per registered user.

| Field | Type | Description |
|-------|------|-------------|
| `_id` | ObjectId | Auto-generated |
| `username` | string | Lowercase username |
| `password` | string | bcrypt hash |
| `email` | string | Email address (optional) |
| `first_name` | string | First name (required on signup) |
| `last_name` | string | Last name (required on signup) |
| `createdAt` | string | ISO timestamp |

#### Collection: `sessions`

One document per chat conversation.

| Field | Type | Description |
|-------|------|-------------|
| `_id` | ObjectId | Auto-generated — used as `session_id` |
| `username` | string | Owner of this chat |
| `agent` | string | AI persona (e.g. `"lisa"`) |
| `title` | string | Auto-generated name, e.g. `"Chat · Feb 18, 2:34 PM"` |
| `createdAt` | string | ISO timestamp |
| `messages` | array | Ordered list of messages (see below) |
| `channelData` | object | *(optional)* YouTube channel JSON `{ videos, channel_url, … }` for tools |
| `uploadedImages` | array | *(optional)* `[{ id, data, mimeType }]` for generateImage anchor |

Each item in `messages`:

| Field | Type | Description |
|-------|------|-------------|
| `role` | string | `"user"` or `"model"` |
| `content` | string | Message text (plain, no CSV base64) |
| `timestamp` | string | ISO timestamp |
| `imageData` | array | *(optional)* Base64 image attachments `[{ data, mimeType }]` |
| `toolCalls` | array | *(optional)* Client-side tool invocations `[{ name, args, result }]` |

## Deploying to Render

See **[DEPLOY_RENDER.md](./DEPLOY_RENDER.md)** for full steps, name-uniqueness notes, and manual vs Blueprint setup.

**Quick summary:** The repo uses a `render.yaml` Blueprint. Service names use unique suffixes (e.g. `joy-hw5-api-9f2k8m4n1p7q`, `joy-hw5-frontend-2b6c0d3e5a9x`) to avoid Render’s global “name in use” errors. Set `REACT_APP_API_URL` on the frontend to your backend URL (e.g. `https://joy-hw5-api-9f2k8m4n1p7q.onrender.com`). If names still conflict, see DEPLOY_RENDER.md for manual deploy (no Blueprint).

---

### Free tier cold starts

Render's free plan spins down services after 15 minutes of inactivity. The first request after a sleep takes ~30 seconds. Upgrade to the Starter plan ($7/mo) to avoid this.

---

## Running the App

### Option 1: Both together (single terminal)

```bash
npm install
npm start
```

> **Note:** `npm install` installs all required packages automatically. See [Dependencies](#dependencies) below for the full list.

### Option 2: Separate terminals (recommended for development)

First, install dependencies once:

```bash
npm install
```

Then open two terminals in the project root:

**Terminal 1 — Backend:**
```bash
npm run server
```

**Terminal 2 — Frontend:**
```bash
npm run client
```

This starts:

- **Backend** – http://localhost:3001  
- **Frontend** – http://localhost:3000  

Use the app at **http://localhost:3000**. The React dev server proxies `/api` requests to the backend.

### Verify Backend

- http://localhost:3001 – Server status page  
- http://localhost:3001/api/status – JSON with `usersCount` and `sessionsCount`

## Dependencies

All packages are installed via `npm install`. Key dependencies:

### Frontend

| Package | Purpose |
|---------|---------|
| `react`, `react-dom` | UI framework |
| `react-scripts` | Create React App build tooling |
| `@google/generative-ai` | Gemini API client (chat, function calling, code execution, search grounding) |
| `react-markdown` | Render markdown in AI responses |
| `remark-gfm` | GitHub-flavored markdown (tables, strikethrough, etc.) |
| `recharts` | Interactive charts (available for future visualizations) |

### Backend

| Package | Purpose |
|---------|---------|
| `express` | HTTP server and REST API |
| `mongodb` | MongoDB driver for Node.js |
| `bcryptjs` | Password hashing |
| `cors` | Cross-origin request headers |
| `dotenv` | Load `.env` variables |

### Dev / Tooling

| Package | Purpose |
|---------|---------|
| `concurrently` | Run frontend and backend with a single `npm start` |

---

## Features

- **Create account / Login** – Username, first name, last name, email, password; bcrypt hashing. AI greets by name on first message.
- **Session-based chat history** – Each conversation is a separate session; sidebar lists all chats with delete option
- **Streaming Gemini responses** – Text streams in real time with animated "..." while thinking; Stop button to cancel
- **Google Search grounding** – Answers include cited web sources for factual queries
- **Python code execution** – Gemini writes and runs Python for plots, regression, histogram, scatter, and any analysis the JS tools can't handle
- **CSV upload** – Drag-and-drop or click to attach a CSV; a slim version of the data (key columns as plain text) plus a full statistical summary are sent to Gemini automatically
- **Auto-computed engagement column** – When a CSV has `Favorite Count` and `View Count` columns, an `engagement` ratio (Favorite Count / View Count) is added automatically to every row
- **Client-side data analysis tools** – Fast, zero-cost function-calling tools that run in the browser. Gemini calls these automatically for data questions; results are saved to MongoDB alongside the message:
  - `compute_column_stats(column)` – mean, median, std, min, max, count for any numeric column
  - `get_value_counts(column, top_n)` – frequency count of each unique value in a categorical column
  - `get_top_tweets(sort_column, n, ascending)` – top or bottom N tweets sorted by any metric (including `engagement`), with tweet text and key metrics
- **Tool routing logic** – The app automatically routes requests: client-side JS tools for simple stats, Python code execution for plots and complex models, Google Search for factual queries
- **Markdown rendering** – AI responses render headers, lists, code blocks, tables, and links
- **Image support** – Attach images via drag-and-drop, the 📎 button, or paste from clipboard (Ctrl+V)
- **YouTube Channel Download tab** – Enter channel URL and max videos (1–100); download metadata JSON with progress; optional write of `public/veritasium_channel_data_10.json` for Veritasium
- **Channel JSON in chat** – Drag-and-drop `.json` (channel data); validated and stored in session; AI context includes summary; tools use stored JSON
- **Four YouTube tools (exact names)** – **generateImage** (prompt, optional anchor_image_id), **plot_metric_vs_time** (metric), **play_video** (query), **compute_stats_json** (field); all documented in `public/prompt_chat.txt`

## Chat System Prompt

The AI’s system instructions are loaded from **`public/prompt_chat.txt`**. Edit this file to change the assistant’s behavior (tone, role, format, etc.). Changes take effect on the next message; no rebuild needed.

### How to Get a Good Persona Prompt (Make the AI Sound Like Someone)

To make the AI sound like a specific person (celebrity, character, or role), ask your AI assistant or prompt engineer to do the following:

1. **Pull a bio** – “Look up [person’s name] on Wikipedia and summarize their background, career, and key facts.”

2. **Find speech examples** – “Search for interviews [person] has done and pull direct quotes that show how they talk—phrases they use, tone, vocabulary.”

3. **Describe the vibe** – “What’s their personality? Confident, shy, funny, formal? List 3–5 traits.”

4. **Define the role** – “This person is my assistant for [context, e.g. a Yale SOM course on Generative AI]. They should help with [specific tasks] while staying in character.”

5. **Ask for the full prompt** – “Write a system prompt for `prompt_chat.txt` that includes: (a) a short bio, (b) speech examples and phrases to mimic, (c) personality traits, and (d) their role as my assistant for [your use case].”

**Example request you can paste into ChatGPT/Claude/etc.:**

> Write a system prompt for a chatbot. The AI should sound like [Person X]. Pull their Wikipedia page and 2–3 interviews. Include: (1) a brief bio, (2) 5–8 direct quotes showing how they speak, (3) personality traits, and (4) their role as my teaching assistant for [Course Name] taught by [Professor] at [School]. Put it all in a format I can paste into `prompt_chat.txt`.
