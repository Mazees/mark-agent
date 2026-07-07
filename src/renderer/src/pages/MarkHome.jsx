import React, { useEffect, useState } from 'react';
import { useChat } from '../contexts/ChatContext';
import OrbVisualizer from '../components/core/OrbVisualizer';
import InputBar from '../components/core/InputBar';
import ResponseArea from '../components/core/ResponseArea';
import StatusIndicator from '../components/core/StatusIndicator';
import FloatingMenu from '../components/core/FloatingMenu';
import HistoryDrawer from '../components/core/HistoryDrawer';
import ProcessPanel from '../components/core/ProcessPanel';
import MemoryVisualizer from '../components/core/MemoryVisualizer';
import musicCoverFallback from '../assets/music-cover.png';
import { useYoutubeMusic } from '../contexts/YoutubeMusicContext';
import { useVAD } from '../hooks/useVAD';

const MarkHome = () => {
  const {
    chatData,
    message,
    setMessage,
    isLoading,
    isSpeak,
    setIsSpeak,
    handlePlanningCommand,
    orbStatus,
    setOrbStatus,
    notifications,
    activeProcesses,
    dismissProcess,
    inputSource,
    handleStop
  } = useChat();
  const { isPlaying, currentTrack, isPlayerOpen } = useYoutubeMusic();

  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isMemoryMapOpen, setIsMemoryMapOpen] = useState(false);
  const [currentResponse, setCurrentResponse] = useState(null);
  const [showMusicWidget, setShowMusicWidget] = useState(false);
  const [isMusicAnimatingOut, setIsMusicAnimatingOut] = useState(false);

  useEffect(() => {
    const handleOpenMap = () => setIsMemoryMapOpen(true);
    window.addEventListener('open-memory-map', handleOpenMap);
    return () => window.removeEventListener('open-memory-map', handleOpenMap);
  }, []);

  const handleVoiceTranscript = (text) => {
    setMessage(text);
    setIsSpeak(true); // Sets global state
    handlePlanningCommand(text, null, false, null, { forceSpeak: true }); // Pass forceSpeak option
  };

  const { isRecording, toggleRecording, toastMessage } = useVAD({
    onTranscript: handleVoiceTranscript
  });

  // Handle music widget exit animation
  useEffect(() => {
    const hasTrack = isPlaying && currentTrack?.title;
    if (hasTrack) {
      setIsMusicAnimatingOut(false);
      setShowMusicWidget(true);
    } else {
      if (showMusicWidget) {
        setIsMusicAnimatingOut(true);
        const timer = setTimeout(() => {
          setShowMusicWidget(false);
          setIsMusicAnimatingOut(false);
        }, 500); // Match the holo-dismiss duration
        return () => clearTimeout(timer);
      }
    }
  }, [isPlaying, currentTrack?.title, showMusicWidget]);

  // Sync orb status based on isLoading
  useEffect(() => {
    if (isLoading) {
      // If last message is thinking, then thinking. Else speaking/executing
      const lastMsg = chatData[chatData.length - 1];
      if (lastMsg?.isThinking) {
        setOrbStatus('thinking');
      } else if (lastMsg?.isSearching) {
        setOrbStatus('thinking');
      } else if (lastMsg?.role === 'ai' && lastMsg?.content?.includes('Mengeksekusi plugin')) {
        setOrbStatus('thinking');
      } else {
        setOrbStatus('listening');
      }
    } else {
      setOrbStatus('idle');
    }
  }, [isLoading, chatData, setOrbStatus]);

  // Derived currentResponse from chatData
  useEffect(() => {
    if (chatData && chatData.length > 0) {
      const lastItem = chatData[chatData.length - 1];
      
      if (lastItem.role === 'ai') {
        if (lastItem.isThinking || lastItem.isSearching) {
          // It's a loading state, we might show a short text
          setCurrentResponse({
            text: lastItem.content || 'Berpikir...',
            type: 'short'
          });
        } else {
          // Final response
          setCurrentResponse({
            text: lastItem.content,
            type: (lastItem.content?.length > 200 || lastItem.content?.includes('\n')) ? 'long' : 'short',
            sources: lastItem.sources || [],
            youtubeData: lastItem.youtubeData,
            youtubeSummary: lastItem.youtubeLink,
            pluginResult: lastItem.pluginExecution,
            isProactive: lastItem.isProactive,
            mood: lastItem.mood
          });
          
          // Trigger holographic beam (speaking animation) to project the text
          if (!lastItem.isThinking) {
            setOrbStatus('speaking');
            setTimeout(() => setOrbStatus('idle'), 2500); // Project the beam for 2.5 seconds
          }
        }
      } else {
        // User message, we can clear current response or show "Processing..."
        if (isLoading) {
          setCurrentResponse({
            text: 'Memproses...',
            type: 'short'
          });
        }
      }
    } else {
      // Empty chat
      setCurrentResponse({
        text: 'Halo, saya Mark. Ada yang bisa saya bantu hari ini?',
        type: 'short'
      });
    }
  }, [chatData, isLoading, isSpeak, setOrbStatus]);

  const handleSubmit = () => {
    if (message.trim()) {
      handlePlanningCommand(message);
    }
  };

  return (
    <div className="h-screen bg-[var(--base-300)] text-white overflow-hidden relative font-['Poppins',sans-serif]">
      {/* Background Ambience */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,oklch(var(--n))_0%,transparent_70%)] opacity-20 pointer-events-none" />
      <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/stardust.png')] opacity-10 pointer-events-none" />

      {/* Floating UI Elements */}
      <FloatingMenu onOpenHistory={() => setIsHistoryOpen(true)} />
      <StatusIndicator notifications={notifications} />
      <ProcessPanel processes={activeProcesses} onDismiss={dismissProcess} />

      {toastMessage && (
        <div className="absolute top-24 left-1/2 -translate-x-1/2 bg-error/90 text-white px-4 py-2 rounded-xl z-50 backdrop-blur shadow-lg animate-bounce text-sm">
          {toastMessage}
        </div>
      )}

      {/* Main Content Area */}
      <div className="relative z-10 flex flex-col items-center w-full h-full px-4 pt-[10vh] pb-40 overflow-y-auto custom-scrollbar">
        
        {/* The Orb */}
        <OrbVisualizer status={orbStatus} intensity={0.5} mood={currentResponse?.mood || 'neutral'} />

        {/* Dynamic Response Area */}
        <div className="w-full max-w-4xl mt-8 flex flex-col items-center justify-center transition-all duration-500 ease-in-out">
          {currentResponse && (
            <ResponseArea currentResponse={currentResponse} />
          )}

          {/* Centered Now Playing Info */}
          {showMusicWidget && (
            <div className={`mt-8 flex flex-col items-center ${isMusicAnimatingOut ? 'animate-[holo-dismiss_0.5s_ease-in_forwards]' : 'animate-[holo-project-in_0.5s_ease-out_forwards]'}`}>
              <div className="relative group w-48 h-48 mb-4 rounded-2xl overflow-hidden border border-white/10 shadow-2xl shadow-primary/20">
                {currentTrack.thumbnail ? (
                  <img 
                    src={currentTrack.thumbnail} 
                    alt="Album Art" 
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" 
                    onError={(e) => { e.target.onerror = null; e.target.src = musicCoverFallback; }}
                  />
                ) : (
                  <img 
                    src={musicCoverFallback} 
                    alt="Default Album Art" 
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                  />
                )}
                {/* Audio visualizer overlay */}
                {isPlaying && (
                  <div className="absolute bottom-0 inset-x-0 h-1/2 bg-gradient-to-t from-black/80 to-transparent flex items-end justify-center pb-4 gap-1">
                    <span className="w-1.5 h-4 bg-primary rounded-t-full animate-[music-bar_1s_ease-in-out_infinite]" style={{ animationDelay: '0.1s' }} />
                    <span className="w-1.5 h-6 bg-primary rounded-t-full animate-[music-bar_1.2s_ease-in-out_infinite]" style={{ animationDelay: '0.3s' }} />
                    <span className="w-1.5 h-3 bg-primary rounded-t-full animate-[music-bar_0.8s_ease-in-out_infinite]" style={{ animationDelay: '0.2s' }} />
                    <span className="w-1.5 h-5 bg-primary rounded-t-full animate-[music-bar_1.1s_ease-in-out_infinite]" style={{ animationDelay: '0.4s' }} />
                  </div>
                )}
              </div>
              <h3 className="text-xl font-bold text-white text-center max-w-md truncate">{currentTrack.title}</h3>
              <p className="text-sm text-white/50 text-center max-w-sm truncate mt-1">{currentTrack.artist}</p>
            </div>
          )}
        </div>

      </div>

      {/* Bottom Input Area */}
      <InputBar 
        value={message}
        onChange={(e) => {
          setMessage(e.target.value);
          if (isSpeak) setIsSpeak(false); // Typing disables voice auto-reply
        }}
        onSubmit={() => {
          setIsSpeak(false); // Typing submit disables voice auto-reply
          handleSubmit();
        }}
        isLoading={isLoading}
        isRecording={isRecording}
        onToggleRecord={toggleRecording}
        onStop={handleStop}
        source={inputSource}
      />

      {/* Slide-out Drawers */}
      <HistoryDrawer 
        isOpen={isHistoryOpen}
        onClose={() => setIsHistoryOpen(false)}
      />

      <MemoryVisualizer 
        isOpen={isMemoryMapOpen}
        onClose={() => setIsMemoryMapOpen(false)}
      />
    </div>
  );
};

export default MarkHome;
