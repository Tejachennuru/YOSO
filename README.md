# VoiceBeats - Chotu's Music System

Quick start (frontend + Python backend):

1. Create a `.env` file at the project root and set your YouTube API key:

```
VITE_YT_API_KEY=YOUR_YOUTUBE_DATA_API_KEY
```

2. Backend setup (Python 3.10+):

```
cd server
python -m venv .venv
./.venv/Scripts/activate      # Windows
pip install -r requirements.txt

# Set weather API if you want weather endpoint (optional)
set OPENWEATHER_API_KEY=YOUR_OPENWEATHER_API_KEY

uvicorn main:app --host 0.0.0.0 --port 8000
```

3. Frontend install and run:

```
npm install
npm run dev

```

The frontend expects the backend at `http://localhost:8000` and proxies API calls from `/api/*` to it during development.
```

Notes:
- Playlists are stored in localStorage, no backend required.
- Use the mic button to voice search. Example commands: "Play telugu rainy vibe songs", "Pause", "Next", "Previous", "Play playlist My Favs".
- This app uses ytmusicapi + yt-dlp via a small FastAPI backend to resolve playable audio streams.

### Avoiding YouTube bot checks (yt-dlp cookies)
Some YouTube requests may require being signed in. Configure yt-dlp to use your browser cookies:

Option A: Use cookies directly from your browser (recommended during development)
```
set YTDLP_COOKIES_FROM_BROWSER=chrome
# or: edge / firefox
```

Option B: Export cookies to a file and point yt-dlp to it
```
set YTDLP_COOKIES_FILE=C:\path\to\cookies.txt
```

Restart the backend after setting either of the above.

# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.
