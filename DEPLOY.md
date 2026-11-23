# Deploy DiamondIQ (dashboard + AI agent) on Render

## 1. Put the files on GitHub (important)
Unzip, then upload the **contents** of the folder so these are visible at the TOP LEVEL of the repo:
`index.html`, `requirements.txt`, `render.yaml`, `Procfile`, and the folder `agent/` (containing server.py, agent.py ...).
Do NOT upload the folder itself (that creates an extra level and the build can't find files).
Tip: on GitHub use Add file → Upload files and drag the files AND the `agent` folder; confirm `agent/server.py` shows up in the repo.

## 2. Create the service on Render
New → Web Service → pick the repo, then:
- Runtime: Python 3
- Build command:  `pip install -r requirements.txt`
- Start command:  `gunicorn --chdir agent server:app --bind 0.0.0.0:$PORT --workers 1 --timeout 120`
- Plan: Free
(Or New → Blueprint, which reads render.yaml and fills this in.)

If your repo has everything inside a subfolder, set Settings → Root Directory to that folder name.

## 3. Open the URL
Login: admin@diamond.com / diamond123. Optional: add env var `ANTHROPIC_API_KEY` for Claude-written summaries and chat.
Free tier sleeps when idle (first load ~30 s).
