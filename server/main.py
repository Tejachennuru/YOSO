from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
import os
import requests
from ytmusicapi import YTMusic
import yt_dlp


API_VERSION = "1.0.0"

# Environment
OPENWEATHER_API_KEY = os.getenv("OPENWEATHER_API_KEY", "")

# Initialize services
ytmusic = YTMusic()

app = FastAPI(title="VoiceBeats Backend", version=API_VERSION)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class SearchItem(BaseModel):
    id: str
    title: str
    channel: str
    thumbnail: str
    duration: Optional[str] = None
    durationSec: Optional[int] = None


def _pick_thumb(thumbnails: Optional[list]) -> str:
    if not thumbnails:
        return ""
    # thumbnails list is sorted small->large usually
    best = thumbnails[-1]
    return best.get("url") or best.get("thumbnails", [{}])[-1].get("url", "")


def _parse_duration_to_seconds(text: Optional[str]) -> Optional[int]:
    if not text:
        return None
    try:
        parts = [int(p) for p in text.split(":")]
        if len(parts) == 3:
            return parts[0] * 3600 + parts[1] * 60 + parts[2]
        if len(parts) == 2:
            return parts[0] * 60 + parts[1]
        if len(parts) == 1:
            return parts[0]
    except Exception:
        return None
    return None


@app.get("/api/health")
def health():
    return {"ok": True, "version": API_VERSION}


@app.get("/api/search", response_model=List[SearchItem])
def search(q: str, filter: str = "songs"):
    if not q:
        return []
    try:
        items = ytmusic.search(q, filter=filter)
        # fallback if empty
        if not items and filter != "videos":
            items = ytmusic.search(q, filter="videos")
        results: List[SearchItem] = []
        for it in items[:20]:
            video_id = it.get("videoId") or it.get("video", {}).get("videoId")
            if not video_id:
                continue
            title = it.get("title") or it.get("name") or "Unknown"
            channel = ", ".join([a.get("name", "") for a in it.get("artists", [])]) or it.get("author", "")
            thumb = _pick_thumb(it.get("thumbnails"))
            dur = it.get("duration")
            dur_sec = _parse_duration_to_seconds(dur)
            results.append(SearchItem(id=video_id, title=title, channel=channel, thumbnail=thumb, duration=dur, durationSec=dur_sec))
        return results
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


def _build_ydl_opts():
    ua = (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
    )
    opts = {
        "format": "bestaudio/best",
        "quiet": True,
        "nocheckcertificate": True,
        "skip_download": True,
        "noplaylist": True,
        "geo_bypass": True,
        "retries": 2,
        "fragment_retries": 2,
        "concurrent_fragment_downloads": 1,
        "force_ip_resolve": "ipv4",
        "http_headers": {"User-Agent": ua},
        # Avoid extra player API requests
        "extractor_args": {"youtube": {"player_skip": ["webpage"]}},
    }
    cookiefile = os.getenv("YTDLP_COOKIES_FILE")
    cookies_from_browser = os.getenv("YTDLP_COOKIES_FROM_BROWSER")
    if cookiefile:
        opts["cookiefile"] = cookiefile
    elif cookies_from_browser:
        # allow syntax BROWSER or BROWSER:PROFILE
        if ":" in cookies_from_browser:
            browser, profile = cookies_from_browser.split(":", 1)
        else:
            browser, profile = cookies_from_browser, None
        # (browser[, profile[, keyring]])
        opts["cookiesfrombrowser"] = (browser, profile, True)
    return opts


@app.get("/api/stream/{video_id}")
def get_stream(video_id: str):
    try:
        ydl_opts = _build_ydl_opts()
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(f"https://www.youtube.com/watch?v={video_id}", download=False)
            url = info.get("url")
            if not url:
                fmts = info.get("formats", [])
                audio = next((f for f in fmts if f.get("vcodec") == "none" and f.get("acodec") != "none"), None)
                url = audio.get("url") if audio else None
            if not url:
                raise RuntimeError("No stream URL found")
            return {"url": url}
    except Exception as e:
        msg = str(e)
        if "Sign in to confirm" in msg or "captcha" in msg.lower():
            raise HTTPException(
                status_code=403,
                detail=(
                    "YouTube requires sign-in for this request. Configure yt-dlp cookies. "
                    "Set env YTDLP_COOKIES_FROM_BROWSER=chrome (or edge/firefox) or YTDLP_COOKIES_FILE=path/to/cookies.txt."
                ),
            )
        raise HTTPException(status_code=500, detail=f"Error getting stream URL: {e}")


@app.get("/api/weather")
def weather(city: str = "Hyderabad", country: str = "IN"):
    if not OPENWEATHER_API_KEY:
        raise HTTPException(status_code=400, detail="OPENWEATHER_API_KEY not set")
    url = f"http://api.openweathermap.org/data/2.5/weather?q={city},{country}&appid={OPENWEATHER_API_KEY}"
    try:
        r = requests.get(url, timeout=10)
        data = r.json()
        w = data.get("weather", [{}])[0]
        return {"main": w.get("main"), "description": w.get("description")}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


