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

## “There’s an error above” with no red text

Render sometimes shows this without highlighting a field. Try the following:

1. **Name**
   - Use **only** lowercase letters, numbers, and hyphens (e.g. `my-hw5-api`). No spaces, no underscores.
   - Must be at least a few characters.

2. **Required fields**
   - **Web Service:** Name, **Build command** (`npm install`), **Start command** (`node server/index.js`). Leave **Root directory** empty (don’t type a space or `.`).
   - **Static Site:** Name, **Build command** (`npm install && ./node_modules/.bin/react-scripts build`), **Publish directory** exactly `build`. Leave **Root directory** empty.

3. **Environment (Web Service)**
   - Add **one** variable: Key = `MONGODB_URI`, Value = your connection string. If the row looks incomplete (e.g. key or value empty), fill both and try again.

4. **Scroll to the top** of the form and check each section for a red message or red border.

5. **Branch**
   - Use the default branch (e.g. `master` or `main`). If you changed it, set it back to the branch you pushed.

6. **Browser**
   - Try another browser or an incognito/private window, then create the service again.

7. **Create without env vars, then add them**
   - **Web Service:** You can create with **no** environment variables, then in the dashboard go to **Environment** → Add `MONGODB_URI` → Save. Trigger a **Manual Deploy**.
   - **Static Site:** Same idea: create first, then add `REACT_APP_GEMINI_API_KEY` and `REACT_APP_API_URL`, Save, and redeploy.

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
