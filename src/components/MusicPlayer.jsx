import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  Play, Pause, SkipForward, SkipBack, Volume2, Mic, MicOff, Search,
  Plus, Heart, List, Shuffle, Repeat, Loader2, X, Trash2, FolderPlus
} from 'lucide-react'
import YouTube from 'react-youtube'

const YOUTUBE_API_KEY = import.meta.env.VITE_YT_API_KEY || ''

const STORAGE_KEYS = {
  playlists: 'vb_playlists_v1',
  lastActive: 'vb_active_playlist_v1',
}

function useLocalStorageObject(key, defaultValue) {
  const [value, setValue] = useState(() => {
    try {
      const raw = localStorage.getItem(key)
      return raw ? JSON.parse(raw) : defaultValue
    } catch {
      return defaultValue
    }
  })
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value))
    } catch {}
  }, [key, value])
  return [value, setValue]
}

function secondsToTimestamp(totalSeconds) {
  const mins = Math.floor(totalSeconds / 60) || 0
  const secs = Math.floor(totalSeconds % 60) || 0
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

export default function MusicPlayer() {
  const playerRef = useRef(null)
  const ytPlayerRef = useRef(null)
  const audioRef = useRef(null)
  const recognitionRef = useRef(null)
  const progressTimerRef = useRef(null)

  const [query, setQuery] = useState('')
  const [isListening, setIsListening] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [results, setResults] = useState([])

  const [currentVideo, setCurrentVideo] = useState(null)
  const [currentStreamUrl, setCurrentStreamUrl] = useState('')
  const [isPlaying, setIsPlaying] = useState(false)
  const [volume, setVolume] = useState(70)
  const [duration, setDuration] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)
  const [loop, setLoop] = useState(false)
  const [shuffle, setShuffle] = useState(false)

  const [playlists, setPlaylists] = useLocalStorageObject(STORAGE_KEYS.playlists, {})
  const [activePlaylistId, setActivePlaylistId] = useState(
    () => localStorage.getItem(STORAGE_KEYS.lastActive) || null
  )
  const activePlaylist = playlists[activePlaylistId] || { id: null, name: 'Queue', songs: [] }
  const [currentIndex, setCurrentIndex] = useState(-1)

  // Save active playlist id
  useEffect(() => {
    if (activePlaylistId) localStorage.setItem(STORAGE_KEYS.lastActive, activePlaylistId)
  }, [activePlaylistId])

  // Speech recognition setup
  useEffect(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) return
    const r = new SR()
    r.continuous = false
    r.interimResults = false
    r.lang = 'en-US'
    r.onstart = () => setIsListening(true)
    r.onerror = () => setIsListening(false)
    r.onend = () => setIsListening(false)
    r.onresult = (e) => {
      const transcript = e.results[0][0].transcript
      handleVoice(transcript)
    }
    recognitionRef.current = r
    return () => {
      try { r.abort() } catch {}
    }
  }, [])

  // Progress polling when playing
  useEffect(() => {
    if (!ytPlayerRef.current) return
    if (!isPlaying) {
      if (progressTimerRef.current) clearInterval(progressTimerRef.current)
      return
    }
    progressTimerRef.current = setInterval(() => {
      const p = ytPlayerRef.current
      if (!p) return
      const t = p.getCurrentTime?.() || 0
      const d = p.getDuration?.() || 0
      setCurrentTime(t)
      setDuration(d)
    }, 500)
    return () => clearInterval(progressTimerRef.current)
  }, [isPlaying])

  function handleVoice(raw) {
    const speech = raw.toLowerCase()
    if (speech.startsWith('play playlist')) {
      const name = speech.replace('play playlist', '').trim()
      const pl = Object.values(playlists).find(p => p.name.toLowerCase() === name)
      if (pl) {
        setActivePlaylistId(pl.id)
        if (pl.songs.length) playAtIndex(0, pl)
      }
      return
    }
    if (speech === 'pause' || speech === 'stop') { togglePlayPause(); return }
    if (speech === 'next') { next(); return }
    if (speech === 'previous' || speech === 'back') { previous(); return }
    if (speech.startsWith('play')) {
      const q = speech.replace('play', '').trim()
      if (q) {
        setQuery(q)
        searchYouTube(q)
      } else if (currentVideo) {
        togglePlayPause()
      }
      return
    }
    // treat as search intent
    setQuery(raw)
    searchYouTube(raw)
  }

  function startListening() {
    if (recognitionRef.current && !isListening) recognitionRef.current.start()
  }

  async function searchYouTube(q) {
    if (!YOUTUBE_API_KEY) {
      // Fallback: client-side search via YouTube suggest API not available; show helpful error
      setResults([])
      alert('Please set VITE_YT_API_KEY in a .env file to enable search.')
      return
    }
    setIsLoading(true)
    try {
      const url = new URL('https://www.googleapis.com/youtube/v3/search')
      url.searchParams.set('part', 'snippet')
      url.searchParams.set('maxResults', '15')
      url.searchParams.set('q', q)
      url.searchParams.set('type', 'video')
      url.searchParams.set('videoCategoryId', '10') // Music
      url.searchParams.set('key', YOUTUBE_API_KEY)

      const res = await fetch(url)
      if (!res.ok) throw new Error('YouTube search failed')
      const data = await res.json()

      // Get durations via videos.list
      const ids = data.items.map(i => i.id.videoId).join(',')
      const vUrl = new URL('https://www.googleapis.com/youtube/v3/videos')
      vUrl.searchParams.set('part', 'contentDetails,snippet')
      vUrl.searchParams.set('id', ids)
      vUrl.searchParams.set('key', YOUTUBE_API_KEY)
      const vRes = await fetch(vUrl)
      const vData = await vRes.json()

      const byId = new Map(vData.items.map(v => [v.id, v]))
      const formatted = data.items.map(i => {
        const v = byId.get(i.id.videoId)
        const iso = v?.contentDetails?.duration || 'PT0S'
        const seconds = iso8601ToSeconds(iso)
        return {
          id: i.id.videoId,
          title: i.snippet.title,
          channel: i.snippet.channelTitle,
          thumbnail: `https://img.youtube.com/vi/${i.id.videoId}/mqdefault.jpg`,
          durationSec: seconds,
          duration: secondsToTimestamp(seconds),
        }
      })
      setResults(formatted)
    } catch (e) {
      console.error(e)
    } finally {
      setIsLoading(false)
    }
  }

  function iso8601ToSeconds(iso) {
    const m = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/.exec(iso)
    if (!m) return 0
    const h = parseInt(m[1] || '0', 10)
    const mn = parseInt(m[2] || '0', 10)
    const s = parseInt(m[3] || '0', 10)
    return h * 3600 + mn * 60 + s
  }

  function ensureActivePlaylist() {
    if (activePlaylistId && playlists[activePlaylistId]) return activePlaylistId
    const id = crypto.randomUUID()
    const pl = { id, name: 'My Queue', createdAt: Date.now(), songs: [] }
    setPlaylists(prev => ({ ...prev, [id]: pl }))
    setActivePlaylistId(id)
    return id
  }

  function addToActive(song) {
    const id = ensureActivePlaylist()
    setPlaylists(prev => ({
      ...prev,
      [id]: { ...prev[id], songs: [...prev[id].songs, song] },
    }))
    if (currentIndex === -1) {
      setCurrentIndex(0)
      playVideo(song)
    }
  }

  function createPlaylist(name) {
    const id = crypto.randomUUID()
    setPlaylists(prev => ({ ...prev, [id]: { id, name, createdAt: Date.now(), songs: [] } }))
    setActivePlaylistId(id)
  }

  function removeSongFromActive(index) {
    if (!activePlaylistId) return
    setPlaylists(prev => {
      const pl = prev[activePlaylistId]
      const nextSongs = pl.songs.slice()
      nextSongs.splice(index, 1)
      return { ...prev, [activePlaylistId]: { ...pl, songs: nextSongs } }
    })
    if (index === currentIndex) {
      if (activePlaylist.songs.length > 1) {
        const nextIdx = Math.min(index, activePlaylist.songs.length - 2)
        setCurrentIndex(nextIdx)
        playVideo(activePlaylist.songs[nextIdx])
      } else {
        stop()
      }
    } else if (index < currentIndex) {
      setCurrentIndex(i => i - 1)
    }
  }

  function playAtIndex(index, pl = activePlaylist) {
    if (!pl.songs[index]) return
    setCurrentIndex(index)
    playVideo(pl.songs[index])
  }

  async function playVideo(song) {
    setCurrentVideo(song)
    setIsPlaying(true)
    // Fetch stream URL from backend and play with <audio>
    try {
      const res = await fetch(`/api/stream/${song.id}`)
      if (!res.ok) throw new Error('Failed to resolve audio stream')
      const data = await res.json()
      setCurrentStreamUrl(data.url)
      // audio will autoplay via effect
    } catch (e) {
      console.error(e)
    }
  }

  function togglePlayPause() {
    const audio = audioRef.current
    if (!audio) return
    if (isPlaying) {
      audio.pause()
      setIsPlaying(false)
    } else {
      audio.play().catch(() => {})
      setIsPlaying(true)
    }
  }

  function stop() {
    setIsPlaying(false)
    setCurrentVideo(null)
    setCurrentIndex(-1)
    setCurrentTime(0)
  }

  function next() {
    const songs = activePlaylist.songs
    if (!songs.length) return
    if (shuffle) {
      const rand = Math.floor(Math.random() * songs.length)
      playAtIndex(rand)
      return
    }
    const nextIndex = currentIndex + 1
    if (nextIndex < songs.length) playAtIndex(nextIndex)
  }

  function previous() {
    const prevIndex = currentIndex - 1
    if (prevIndex >= 0) playAtIndex(prevIndex)
  }

  function onEnd() {
    if (loop) {
      const audio = audioRef.current
      if (audio) {
        audio.currentTime = 0
        audio.play().catch(() => {})
      }
      return
    }
    next()
  }

  function onReady() {}
  function onStateChange() {}

  function setPlayerVolume(v) {
    setVolume(v)
    if (audioRef.current) audioRef.current.volume = Math.max(0, Math.min(1, v / 100))
  }

  function seekTo(percent) {
    if (!duration || !audioRef.current) return
    const t = (percent / 100) * duration
    audioRef.current.currentTime = t
    setCurrentTime(t)
  }

  // Wire up <audio> element for duration/time and autoplay
  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    const onLoaded = () => {
      setDuration(Math.floor(audio.duration || 0))
      if (isPlaying) audio.play().catch(() => {})
    }
    const onTime = () => {
      setCurrentTime(audio.currentTime || 0)
    }
    const onEnded = () => onEnd()
    audio.addEventListener('loadedmetadata', onLoaded)
    audio.addEventListener('timeupdate', onTime)
    audio.addEventListener('ended', onEnded)
    return () => {
      audio.removeEventListener('loadedmetadata', onLoaded)
      audio.removeEventListener('timeupdate', onTime)
      audio.removeEventListener('ended', onEnded)
    }
  }, [isPlaying])

  useEffect(() => {
    // Autoplay when stream URL changes
    const audio = audioRef.current
    if (audio && currentStreamUrl) {
      audio.load()
      if (isPlaying) audio.play().catch(() => {})
    }
  }, [currentStreamUrl])

  return (
    <div className="beatX-section">
      <div className="main-section">
        <header className="header">
          <div className="container header-row">
            <div>
            <h1 className="brand">🎵 YOSO</h1>
            <p className='brandby'>By The TechX</p>
            </div>
            <div className="search-wrap">
              <input
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && query.trim() && searchYouTube(query)}
                placeholder="Search or say 'Play telugu rainy vibe songs'"
                className="search-input"
              />
              <button
                onClick={() => query.trim() && searchYouTube(query)}
                className="search-btn"
                aria-label="Search"
              >
                <Search size={18} />
              </button>
            </div>
            <button
              onClick={startListening}
              disabled={isListening}
              className={`icon-btn ${isListening ? 'danger' : ''}`}
              aria-label="Voice search"
            >
              {isListening ? <MicOff size={18} /> : <Mic size={18} />}
            </button>
          </div>
        </header>

        <main className="container">
          <section>
            {currentVideo && (
              <div className="card player-card">
                <div className="player">
                  <div className="player-video" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ color: 'var(--text-dim)', fontSize: 12 }}>Streaming audio</div>
                  </div>
                  <div className="player-meta">
                    <h3 className="title">{currentVideo.title}</h3>
                    <p className="subtitle">{currentVideo.channel}</p>
                    <div className="progress">
                      <div className="bar" onClick={(e) => {
                        const rect = e.currentTarget.getBoundingClientRect()
                        const percent = ((e.clientX - rect.left) / rect.width) * 100
                        seekTo(percent)
                      }}>
                        <div className="fill" style={{ width: `${duration ? (currentTime / duration) * 100 : 0}%` }} />
                      </div>
                      <div className="times">
                        <span>{secondsToTimestamp(currentTime)}</span>
                        <span>{secondsToTimestamp(duration)}</span>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="controls">
                  <audio ref={audioRef} src={currentStreamUrl} preload="metadata" />
                  <button onClick={previous} className="icon-btn"><SkipBack size={12} /></button>
                  <button onClick={togglePlayPause} className="icon-btn">
                    {isPlaying ? <Pause size={16} /> : <Play size={16} />}
                  </button>
                  <button onClick={next} className="icon-btn"><SkipForward size={12} /></button>
                  <div className="volume">
                    <Volume2 size={16} />
                    <input type="range" min="0" max="100" value={volume} onChange={e => setPlayerVolume(parseInt(e.target.value, 10))} className="range" />
                  </div>
                  <button onClick={() => setShuffle(s => !s)} className={`toggle ${shuffle ? 'active' : ''}`} title="Shuffle">
                    <Shuffle size={14} />
                  </button>
                  <button onClick={() => setLoop(l => !l)} className={`toggle ${loop ? 'active' : ''}`} title="Repeat">
                    <Repeat size={14} />
                  </button>
                </div>
              </div>
            )}

            <div className="grid playing-commands-section" style={{ gap: 24 }}>
              <div className="card now-playing-card">
                <div className="header-row" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
                  <h2 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}><List size={20} /> Now Playing</h2>
                  <button onClick={() => { const name = prompt('New playlist name?')?.trim(); if (name) createPlaylist(name) }} className="chip" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><FolderPlus size={16}/> New</button>
                </div>
                <div className="chips">
                  {Object.values(playlists).map(pl => (
                    <button key={pl.id} onClick={() => setActivePlaylistId(pl.id)} className={`chip ${pl.id === activePlaylistId ? 'active' : ''}`}>{pl.name}</button>
                  ))}
                </div>
                <div className="queue" style={{ marginTop: 12 }}>
                  {activePlaylist.songs.length === 0 && (
                    <p className="muted">Add songs to your playlist from search results.</p>
                  )}
                  {activePlaylist.songs.map((song, idx) => (
                    <div key={`${song.id}-${idx}`} className={`qrow ${idx === currentIndex ? 'active' : ''}`}>
                      <img src={song.thumbnail} alt={song.title} className="thumb" style={{ width: 40, height: 40 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="row-title" style={{ fontSize: 14 }}>{song.title}</div>
                        <div className="row-sub" style={{ fontSize: 11 }}>{song.channel}</div>
                      </div>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button onClick={() => playAtIndex(idx)} className="icon-btn"><Play size={14}/></button>
                        <button onClick={() => removeSongFromActive(idx)} className="icon-btn"><Trash2 size={14}/></button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>
        </main>
      </div>
      
      <div className="">
        <div className="card commands-card">
          <h2 className="card-title">Voice Commands</h2>
          <div className="muted">
            <p>• Play [song name]</p>
            <p>• Play Telugu rainy vibe songs</p>
            <p>• Play playlist [name]</p>
            <p>• Pause / Stop / Next / Previous</p>
          </div>
        </div>

        {isLoading && (
          <div>
            <Loader2 className="inline-block" />
            <p className="muted">Searching for music...</p>
          </div>
        )}

        {results.length > 0 && (
          <div className="card search-section">
            <h2 className="card-title">Search Results</h2>
            <div className="list search-queue">
              {results.map((song) => (
                <div key={song.id} className="row">
                  <img src={song.thumbnail} alt={song.title} className="thumb" />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="row-title">{song.title}</div>
                    <div className="row-sub">{song.channel} • {song.duration}</div>
                  </div>
                  <div className="row-actions">
                    <button onClick={() => { playVideo(song); if (!activePlaylist.songs.length) addToActive(song) }} className="icon-btn"><Play size={16} /></button>
                    <button onClick={() => addToActive(song)} className="icon-btn"><Plus size={16} /></button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}


