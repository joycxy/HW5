# Deploying to Render

**Blueprint is turned off** so Render won’t force service names from a file. Create both services **by hand** and **choose the names yourself** in the Render UI. That avoids “name already in use” because you’re not reusing any name from the repo.

---

## Step 1: Create the backend (Web Service)

1. Go to [render.com](https://render.com) → **New** → **Web Service**.
2. Connect your GitHub repo (this repo).
3. **Name:** Type a name only you would use, e.g. **`joycxy-hw5-api-mar1`** or **`my-hw5-backend-2026`**. Render will tell you right away if it’s taken; if so, change a letter or add a number until it’s accepted. Do **not** use a name from any file in the repo.
4. **Settings:**
   - **Build command:** `npm install`
   - **Start command:** `node server/index.js`
   - **Root directory:** leave blank
5. **Environment:** Add variable **`MONGODB_URI`** = your MongoDB Atlas connection string.
6. Click **Create Web Service** and wait for the first deploy.
7. Copy the service URL (e.g. `https://joycxy-hw5-api-mar1.onrender.com`). You need it for the frontend.

---

## Step 2: Create the frontend (Static Site)

1. **New** → **Static Site**.
2. Connect the **same** GitHub repo.
3. **Name:** Again, pick your own, e.g. **`joycxy-hw5-site-mar1`** or **`my-hw5-frontend-2026`**. Change it if Render says it’s in use.
4. **Settings:**
   - **Build command:** `npm install && ./node_modules/.bin/react-scripts build`
   - **Publish directory:** `build`
   - **Root directory:** leave blank
5. **Environment:** Add:
   - **`REACT_APP_GEMINI_API_KEY`** = your Gemini API key  
   - **`REACT_APP_API_URL`** = the **backend URL from Step 1** (e.g. `https://joycxy-hw5-api-mar1.onrender.com`)
6. Click **Create Static Site** and wait for the build.

Your app will be at the static site URL. The frontend talks to the backend using `REACT_APP_API_URL`.

---

## Why “name already in use” was happening

Render service names are **global**. The repo used to have a **Blueprint** (`render.yaml`) with fixed names. Render tried to create services with those names; if they were already taken (by you or someone else), you got “name in use” and couldn’t change them from the Blueprint flow.

**Fix:** We renamed `render.yaml` to **`render.yaml.disabled`** so Render no longer sees a Blueprint. You create the two services manually and type the names in the form. Whatever name Render accepts there will work.

---

## Reference: fields at a glance

| Service   | Type         | Build command                                               | Start / Publish      |
|----------|--------------|-------------------------------------------------------------|----------------------|
| Backend  | Web Service  | `npm install`                                               | Start: `node server/index.js` |
| Frontend | Static Site  | `npm install && ./node_modules/.bin/react-scripts build`   | Publish: `build`     |

- **REACT_APP_API_URL** is baked in at **build time**. If you change the backend URL later, set the new value in the frontend’s env and **redeploy** the frontend.
- Free tier services sleep after ~15 min; the first request after that can take ~30 s.

---

## Re-enabling the Blueprint later

If you want to use the Blueprint again later, rename **`render.yaml.disabled`** back to **`render.yaml`**, push, and use **New → Blueprint** with your repo. You may still need to edit the `name:` values in that file if they’re taken.
