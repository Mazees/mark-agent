import React, { useState, useEffect } from 'react'

/**
 * Sentient Cybernetic Digital Face (Mark Core Avatar)
 * Desain avatar AI holografik murni tanpa kotak kaku, dengan ekspresi mata digital
 * ekspresif yang langsung mencerminkan 10 emosi secara jelas dan dinamis.
 */
const SentientCyberEyes = ({
  mood = 'neutral',
  status = 'idle',
  intensity = 0,
  colorHex = '#1fb854'
}) => {
  const [isBlinking, setIsBlinking] = useState(false)

  // Otomatis berkedip secara natural setiap 3.5 - 6 detik
  useEffect(() => {
    let blinkTimeout
    const triggerBlink = () => {
      setIsBlinking(true)
      setTimeout(() => {
        setIsBlinking(false)
        const nextDelay = 3500 + Math.random() * 2500
        blinkTimeout = setTimeout(triggerBlink, nextDelay)
      }, 160)
    }

    const initialDelay = 2000 + Math.random() * 2000
    blinkTimeout = setTimeout(triggerBlink, initialDelay)

    return () => clearTimeout(blinkTimeout)
  }, [])

  // Dynamic scale audio voice
  const voiceScale = status === 'speaking' ? 1 + intensity * 0.35 : 1

  return (
    <div
      className="relative w-36 h-24 flex flex-col items-center justify-center pointer-events-none select-none"
      style={{
        transform: `scale(${voiceScale})`,
        transition: 'transform 75ms ease-out'
      }}
    >
      {/* SVG Container untuk Mata Digital Holografik */}
      <svg
        viewBox="0 0 120 60"
        className="w-full h-full drop-shadow-[0_0_16px_currentColor]"
        style={{ color: colorHex }}
      >
        <defs>
          <filter id="cyber-glow-strong" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="2" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>

        {isBlinking ? (
          // Keadaan Berkedip (Blink)
          <g stroke="currentColor" strokeWidth="4" strokeLinecap="round">
            <line x1="20" y1="30" x2="48" y2="30" />
            <line x1="72" y1="30" x2="100" y2="30" />
          </g>
        ) : (
          // Render Geometri Mata Berdasarkan Mood
          <g filter="url(#cyber-glow-strong)">
            {/* 1. JOY (Senang / Ceria: Lengkungan Tersenyum ^ ^) */}
            {mood === 'joy' && (
              <>
                <path
                  d="M 20 34 Q 34 14 48 34"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="5"
                  strokeLinecap="round"
                />
                <path
                  d="M 72 34 Q 86 14 100 34"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="5"
                  strokeLinecap="round"
                />
                <circle cx="34" cy="38" r="2.5" fill="currentColor" opacity="0.8" />
                <circle cx="86" cy="38" r="2.5" fill="currentColor" opacity="0.8" />
              </>
            )}

            {/* 2. ANGER (Marah / Sengit: Garis Menyudut Tajam \ /) */}
            {mood === 'anger' && (
              <>
                <polygon
                  points="18,18 50,32 50,38 18,24"
                  fill="currentColor"
                  className="animate-pulse"
                />
                <polygon
                  points="102,18 70,32 70,38 102,24"
                  fill="currentColor"
                  className="animate-pulse"
                />
                <line
                  x1="14"
                  y1="12"
                  x2="52"
                  y2="28"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeLinecap="round"
                />
                <line
                  x1="106"
                  y1="12"
                  x2="68"
                  y2="28"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeLinecap="round"
                />
              </>
            )}

            {/* 3. SADNESS (Sedih / Murung: Lengkungan Menunduk / \) */}
            {mood === 'sadness' && (
              <>
                <path
                  d="M 20 26 Q 34 42 48 30"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="4.5"
                  strokeLinecap="round"
                />
                <path
                  d="M 100 26 Q 86 42 72 30"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="4.5"
                  strokeLinecap="round"
                />
                <circle cx="34" cy="38" r="3" fill="currentColor" opacity="0.6" />
                <circle cx="86" cy="38" r="3" fill="currentColor" opacity="0.6" />
              </>
            )}

            {/* 4. ANXIETY (Cemas / Gelisah / Nervous: Alis Tegang, Pupil Bergetar, Tetesan Keringat Cyber) */}
            {mood === 'anxiety' && (
              <>
                {/* Alis Tegang Bergelombang */}
                <path
                  d="M 18 16 Q 34 22 50 16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                />
                <path
                  d="M 70 16 Q 86 22 102 16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                />

                {/* Mata dengan Pupil Micro-Vibrate */}
                <g className="animate-[anxiety-vibrate_0.15s_linear_infinite]">
                  <rect
                    x="20"
                    y="22"
                    width="28"
                    height="18"
                    rx="8"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3.5"
                  />
                  <circle cx="38" cy="29" r="4" fill="currentColor" />
                  <circle cx="39" cy="28" r="1.5" fill="#ffffff" />

                  <rect
                    x="72"
                    y="22"
                    width="28"
                    height="18"
                    rx="8"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3.5"
                  />
                  <circle cx="90" cy="29" r="4" fill="currentColor" />
                  <circle cx="91" cy="28" r="1.5" fill="#ffffff" />
                </g>

                {/* Cyber Sweat Drop di Sudut Samping */}
                <g className="animate-[sweat-drip_2s_ease-in-out_infinite]">
                  <path
                    d="M 109 10 C 109 10, 114 16, 114 20 A 3.5 3.5 0 1 1 104 20 C 104 16, 109 10, 109 10 Z"
                    fill="currentColor"
                  />
                </g>
              </>
            )}

            {/* 5. FEAR (Takut / Panik: Lensa Membesar Lebar O O) */}
            {mood === 'fear' && (
              <>
                <circle cx="34" cy="30" r="14" fill="none" stroke="currentColor" strokeWidth="4" />
                <circle cx="34" cy="30" r="5.5" fill="currentColor" className="animate-pulse" />
                <circle cx="86" cy="30" r="14" fill="none" stroke="currentColor" strokeWidth="4" />
                <circle cx="86" cy="30" r="5.5" fill="currentColor" className="animate-pulse" />
              </>
            )}

            {/* 6. DISGUST / SARCASM (Jijik / Sinis: Mata Mengernyit Asimetris ¬ _) */}
            {mood === 'disgust' && (
              <>
                <path d="M 20 24 L 48 18 L 50 32 L 22 36 Z" fill="currentColor" />
                <line
                  x1="70"
                  y1="30"
                  x2="100"
                  y2="30"
                  stroke="currentColor"
                  strokeWidth="5"
                  strokeLinecap="round"
                />
              </>
            )}

            {/* 7. ENVY (Iri / Tertarik: Slit Horisontal Tajam Glare) */}
            {mood === 'envy' && (
              <>
                <polygon points="18,28 48,22 50,34 20,36" fill="currentColor" />
                <polygon points="72,22 102,28 100,36 70,34" fill="currentColor" />
                <circle cx="36" cy="29" r="3" fill="#ffffff" />
                <circle cx="84" cy="29" r="3" fill="#ffffff" />
              </>
            )}

            {/* 8. EMBARRASSMENT (Malu / Tersipu: Mata Terpejam Rapat > < + Blush) */}
            {mood === 'embarrassment' && (
              <>
                <path
                  d="M 20 22 L 35 32 L 20 42"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="4.5"
                  strokeLinecap="round"
                />
                <path
                  d="M 100 22 L 85 32 L 100 42"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="4.5"
                  strokeLinecap="round"
                />
                <ellipse cx="26" cy="45" rx="6" ry="2.5" fill="currentColor" opacity="0.7" />
                <ellipse cx="94" cy="45" rx="6" ry="2.5" fill="currentColor" opacity="0.7" />
              </>
            )}

            {/* 9. ENNUI (Bosan / Malas: Garis Lelah Mengantuk - -) */}
            {mood === 'ennui' && (
              <>
                <line
                  x1="18"
                  y1="32"
                  x2="48"
                  y2="32"
                  stroke="currentColor"
                  strokeWidth="4.5"
                  strokeLinecap="round"
                />
                <line
                  x1="72"
                  y1="32"
                  x2="102"
                  y2="32"
                  stroke="currentColor"
                  strokeWidth="4.5"
                  strokeLinecap="round"
                />
                <path
                  d="M 18 27 Q 33 22 48 27"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  opacity="0.5"
                />
                <path
                  d="M 72 27 Q 87 22 102 27"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  opacity="0.5"
                />
              </>
            )}

            {/* 10. NEUTRAL (Standar / Siaga: Dual Cyber Visor Pods Simetris [ ▪  ▪ ]) */}
            {mood === 'neutral' && (
              <>
                <rect
                  x="20"
                  y="22"
                  width="28"
                  height="16"
                  rx="6"
                  fill="currentColor"
                  opacity="0.9"
                />
                <circle cx="34" cy="30" r="3.5" fill="#ffffff" />
                <rect
                  x="72"
                  y="22"
                  width="28"
                  height="16"
                  rx="6"
                  fill="currentColor"
                  opacity="0.9"
                />
                <circle cx="86" cy="30" r="3.5" fill="#ffffff" />
              </>
            )}
          </g>
        )}
      </svg>

      {/* Gelombang Suara (Voice Waveform) saat Mark Berbicara */}
      {status === 'speaking' && (
        <div className="flex items-center gap-1 mt-1 h-3.5">
          <span
            className="w-1 bg-current rounded-full animate-bounce"
            style={{ height: `${Math.max(4, intensity * 16)}px`, color: colorHex }}
          />
          <span
            className="w-1 bg-current rounded-full animate-bounce [animation-delay:100ms]"
            style={{ height: `${Math.max(6, intensity * 24)}px`, color: colorHex }}
          />
          <span
            className="w-1 bg-current rounded-full animate-bounce [animation-delay:200ms]"
            style={{ height: `${Math.max(8, intensity * 30)}px`, color: colorHex }}
          />
          <span
            className="w-1 bg-current rounded-full animate-bounce [animation-delay:300ms]"
            style={{ height: `${Math.max(6, intensity * 24)}px`, color: colorHex }}
          />
          <span
            className="w-1 bg-current rounded-full animate-bounce [animation-delay:400ms]"
            style={{ height: `${Math.max(4, intensity * 16)}px`, color: colorHex }}
          />
        </div>
      )}
    </div>
  )
}

const CubeVisualizer = ({ status = 'idle', intensity = 0, mood = 'neutral' }) => {
  const [glowClass, setGlowClass] = useState('bg-green-500/40')
  const [colorHex, setColorHex] = useState('#1fb854')

  useEffect(() => {
    if (status === 'error') {
      setGlowClass('bg-red-500/40')
      setColorHex('#ef4444')
    } else {
      switch (mood) {
        case 'joy':
          setGlowClass('bg-yellow-400/40')
          setColorHex('#facc15')
          break
        case 'sadness':
          setGlowClass('bg-blue-500/40')
          setColorHex('#3b82f6')
          break
        case 'fear':
          setGlowClass('bg-purple-500/40')
          setColorHex('#a855f7')
          break
        case 'anger':
          setGlowClass('bg-red-500/40')
          setColorHex('#ef4444')
          break
        case 'disgust':
          setGlowClass('bg-lime-400/40')
          setColorHex('#84cc16') // Acid Lime Green (sangat kontras dari Emerald neutral #1fb854)
          break
        case 'anxiety':
          setGlowClass('bg-orange-500/40')
          setColorHex('#f97316')
          break
        case 'envy':
          setGlowClass('bg-teal-500/40')
          setColorHex('#14b8a6')
          break
        case 'embarrassment':
          setGlowClass('bg-pink-500/40')
          setColorHex('#ec4899')
          break
        case 'ennui':
          setGlowClass('bg-gray-500/40')
          setColorHex('#9ca3af')
          break
        default: // neutral
          setGlowClass('bg-green-500/40')
          setColorHex('#1fb854') // Emerald signature green
          break
      }
    }
  }, [mood, status])

  // Scale dinamis berdasarkan status eksekusi
  let targetScale = 1
  if (status === 'thinking') targetScale = 1.15
  else if (status === 'nudge') targetScale = 1.05
  else if (status === 'speaking') targetScale = 1 + intensity * 0.4
  else targetScale = 1

  return (
    <>
      <style>
        {`
          @keyframes orbital-spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
          @keyframes orbital-spin-rev {
            0% { transform: rotate(360deg); }
            100% { transform: rotate(0deg); }
          }
          @keyframes anxiety-vibrate {
            0% { transform: translate(0, 0); }
            25% { transform: translate(-1.5px, 1px); }
            50% { transform: translate(1.5px, -1px); }
            75% { transform: translate(-1px, -1.5px); }
            100% { transform: translate(0, 0); }
          }
          @keyframes sweat-drip {
            0% { transform: translateY(0) scale(0.8); opacity: 0; }
            20% { transform: translateY(2px) scale(1); opacity: 0.9; }
            75% { transform: translateY(8px) scale(1.1); opacity: 0.8; }
            100% { transform: translateY(14px) scale(0.4); opacity: 0; }
          }
        `}
      </style>
      <div className="relative shrink-0 w-56 h-56 flex items-center justify-center my-8 select-none">
        {/* Layer 1: Constant Breathing Wrapper */}
        <div className="relative w-full h-full flex items-center justify-center animate-[orb-breathe_5s_ease-in-out_infinite] will-change-transform">
          {/* Layer 2: State & Audio Scaler */}
          <div
            className="relative w-full h-full flex items-center justify-center ease-out will-change-transform"
            style={{
              transitionProperty: 'transform',
              transitionDuration: status === 'speaking' ? '75ms' : '500ms',
              transform: `scale(${targetScale})`
            }}
          >
            {/* Background Aura Glow */}
            <div
              className={`absolute inset-0 m-auto w-40 h-40 rounded-full ${glowClass} blur-[50px] will-change-transform opacity-75`}
            />

            {/* Holographic Orbital Rings */}
            <div
              className="absolute inset-0 m-auto w-44 h-44 rounded-full border border-dashed opacity-30 animate-[orbital-spin_20s_linear_infinite]"
              style={{ borderColor: colorHex }}
            />
            <div
              className="absolute inset-0 m-auto w-36 h-36 rounded-full border border-dotted opacity-20 animate-[orbital-spin-rev_15s_linear_infinite]"
              style={{ borderColor: colorHex }}
            />

            {/* Holographic HUD Center Visor */}
            <div className="relative z-20 flex items-center justify-center">
              <SentientCyberEyes
                mood={mood}
                status={status}
                intensity={intensity}
                colorHex={colorHex}
              />
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

export default CubeVisualizer
