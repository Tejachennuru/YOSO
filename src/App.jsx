import React, { useState } from 'react';
import MusicPlayer from './components/MusicPlayer';
import './App.css';

function App() {
  const [currentTrack, setCurrentTrack] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(80);
  const [isMuted, setIsMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  return (
    <div className="app">
      <MusicPlayer 
        currentTrack={currentTrack}
        isPlaying={isPlaying}
        volume={volume}
        isMuted={isMuted}
        currentTime={currentTime}
        duration={duration}
        onPlayPause={() => setIsPlaying(!isPlaying)}
        onVolumeChange={setVolume}
        onMuteToggle={() => setIsMuted(!isMuted)}
        onSeek={setCurrentTime}
      />
    </div>
  );
}

export default App;
