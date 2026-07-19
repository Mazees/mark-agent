import { useEffect, useRef, useState, useCallback } from 'react'
import { Camera } from 'lucide-react'

export const CameraPreview = ({
  isOpen,
  onCapture,
  onClose,
  deviceId = null,
  countdown = 5,
  isAutonomous = false
}) => {
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const canvasRef = useRef(null)
  const [timeLeft, setTimeLeft] = useState(countdown)
  const [error, setError] = useState(null)
  const [isReady, setIsReady] = useState(false)
  const hasCapturedRef = useRef(false)

  const stopStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
  }, [])

  const captureFrame = useCallback(() => {
    console.log('[CameraPreview] captureFrame called. hasCaptured:', hasCapturedRef.current, 'video:', !!videoRef.current, 'canvas:', !!canvasRef.current)
    if (hasCapturedRef.current || !videoRef.current || !canvasRef.current) {
      console.log('[CameraPreview] captureFrame aborted!')
      return
    }
    hasCapturedRef.current = true

    try {
      const video = videoRef.current
      const canvas = canvasRef.current
      const ctx = canvas.getContext('2d')

      // Maintain aspect ratio, max 1280x720
      let width = video.videoWidth || 1280
      let height = video.videoHeight || 720
      
      if (width > 1280 || height > 720) {
        const ratio = Math.min(1280 / width, 720 / height)
        width = Math.floor(width * ratio)
        height = Math.floor(height * ratio)
      }

      canvas.width = width
      canvas.height = height
      ctx.drawImage(video, 0, 0, width, height)

      // Convert to base64 JPEG 70%
      const base64Data = canvas.toDataURL('image/jpeg', 0.7)
      console.log('[CameraPreview] Frame captured, size:', Math.round(base64Data.length / 1024), 'KB')
      stopStream()
      onCapture(base64Data)
    } catch (e) {
      console.error('[CameraPreview] Error during captureFrame:', e)
      stopStream()
      onCapture(null)
    }
  }, [onCapture, stopStream])

  // Main effect: open/close camera
  useEffect(() => {
    if (!isOpen) {
      setIsReady(false)
      return
    }

    let isMounted = true
    hasCapturedRef.current = false
    setTimeLeft(countdown)
    setError(null)
    setIsReady(false)

    const initCamera = async () => {
      try {
        console.log('[CameraPreview] Requesting camera access..., deviceId:', deviceId)
        
        // Start with simple constraints first, then try specific deviceId
        const constraints = {
          video: deviceId && deviceId !== 'default'
            ? { deviceId: { exact: deviceId } }
            : true,
          audio: false
        }
        
        console.log('[CameraPreview] getUserMedia constraints:', JSON.stringify(constraints))
        const stream = await navigator.mediaDevices.getUserMedia(constraints)
        console.log('[CameraPreview] Got stream:', stream.getVideoTracks().length, 'video tracks')

        if (!isMounted) {
          stream.getTracks().forEach(t => t.stop())
          return
        }

        streamRef.current = stream

        if (videoRef.current) {
          videoRef.current.srcObject = stream
          
          // Wait for video to actually start playing
          videoRef.current.onloadedmetadata = () => {
            console.log('[CameraPreview] Video metadata loaded, dimensions:', videoRef.current.videoWidth, 'x', videoRef.current.videoHeight)
            if (!isMounted) return
            
            videoRef.current.play().then(() => {
              console.log('[CameraPreview] Video playing')
              if (!isMounted) return
              setIsReady(true)

              if (isAutonomous) {
                // Wait a bit for auto-focus, then snap instantly
                setTimeout(() => {
                  console.log('[CameraPreview] setTimeout 800ms finished. isMounted:', isMounted, 'hasCaptured:', hasCapturedRef.current)
                  if (isMounted && !hasCapturedRef.current) captureFrame()
                }, 800)
              }
            }).catch(err => {
              console.error('[CameraPreview] Play error:', err)
            })
          }
        }
      } catch (err) {
        console.error('[CameraPreview] Camera access error:', err.name, err.message)
        if (isMounted) {
          setError(err.message)
          stopStream()
          // Delay onClose slightly so error is visible
          setTimeout(() => {
            if (isMounted) onClose()
          }, 2000)
        }
      }
    }

    initCamera()

    return () => {
      isMounted = false
      stopStream()
    }
  }, [isOpen]) // Minimal deps - only re-run when isOpen changes

  // Countdown timer (only when camera is ready and not autonomous)
  useEffect(() => {
    if (!isOpen || !isReady || isAutonomous || error || hasCapturedRef.current) return

    if (timeLeft <= 0) {
      captureFrame()
      return
    }

    const timer = setTimeout(() => {
      setTimeLeft(prev => prev - 1)
    }, 1000)

    return () => clearTimeout(timer)
  }, [isOpen, isReady, isAutonomous, timeLeft, error, captureFrame])

  // Don't render UI if closed or autonomous mode, but keep video for autonomous
  if (!isOpen) return null
  if (isAutonomous) {
    return (
      <div className="fixed bottom-0 right-0 w-1 h-1 opacity-0 pointer-events-none overflow-hidden">
        <video ref={videoRef} autoPlay playsInline muted className="w-full h-full" />
        <canvas ref={canvasRef} className="w-full h-full" />
      </div>
    )
  }

  return (
    <div className="fixed bottom-24 right-6 z-50" style={{ animation: 'slideUpFadeIn 0.3s ease-out' }}>
      <style>{`
        @keyframes slideUpFadeIn {
          from { opacity: 0; transform: translateY(20px) scale(0.95); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
      <div className="w-[320px] rounded-2xl border border-white/10 bg-base-100/70 backdrop-blur-xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-4 py-3 flex items-center justify-between border-b border-white/5 bg-base-200/50">
          <div className="flex items-center gap-2">
            <Camera className="w-4 h-4 text-primary" />
            <span className="font-semibold text-sm">Mark Glance</span>
          </div>
          {error ? (
            <div className="badge badge-sm border-0 bg-error/20 text-error font-bold">Error</div>
          ) : !isReady ? (
            <span className="loading loading-dots loading-xs text-primary"></span>
          ) : (
            <div className={`badge badge-sm border-0 font-bold ${
              timeLeft > 3 ? 'bg-primary/20 text-primary' : 
              timeLeft > 1 ? 'bg-warning/20 text-warning' : 
              'bg-error/20 text-error'
            }`}>
              {timeLeft}s
            </div>
          )}
        </div>

        {/* Video Container */}
        <div className="relative bg-black w-full aspect-video">
          {error ? (
            <div className="absolute inset-0 flex items-center justify-center text-error/70 text-xs p-4 text-center">
              ⚠️ {error}
            </div>
          ) : (
            <>
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover"
              />
              <canvas ref={canvasRef} className="hidden" />
            </>
          )}
          
          {/* Flash Effect on Capture */}
          {timeLeft <= 0 && isReady && !error && (
            <div className="absolute inset-0 bg-white/80 animate-pulse pointer-events-none" />
          )}
        </div>

        {/* Progress Bar */}
        {isReady && !error && (
          <div className="h-1 w-full bg-base-300/50">
            <div 
              className="h-full bg-gradient-to-r from-primary to-secondary transition-all duration-1000 ease-linear"
              style={{ width: `${(timeLeft / countdown) * 100}%` }}
            />
          </div>
        )}
      </div>
    </div>
  )
}
