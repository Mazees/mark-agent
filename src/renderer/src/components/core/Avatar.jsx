/* eslint-disable react/prop-types */
import { useEffect, useRef, useCallback, memo } from 'react'

/**
 * Mapping warna terpadu berdasarkan Mood & Status AI Mark
 */
const getMoodColor = (mood = 'neutral', status = 'idle') => {
  if (status === 'error') {
    return { hex: '#ef4444', glow: 'bg-red-500/40' }
  }
  switch (mood) {
    case 'joy':
      return { hex: '#facc15', glow: 'bg-yellow-400/40' }
    case 'sadness':
      return { hex: '#3b82f6', glow: 'bg-blue-500/40' }
    case 'fear':
      return { hex: '#a855f7', glow: 'bg-purple-500/40' }
    case 'anger':
      return { hex: '#ef4444', glow: 'bg-red-500/40' }
    case 'disgust':
      return { hex: '#84cc16', glow: 'bg-lime-400/40' }
    case 'anxiety':
      return { hex: '#f97316', glow: 'bg-orange-500/40' }
    case 'envy':
      return { hex: '#14b8a6', glow: 'bg-teal-500/40' }
    case 'embarrassment':
      return { hex: '#ec4899', glow: 'bg-pink-500/40' }
    case 'ennui':
      return { hex: '#6b7280', glow: 'bg-gray-500/40' }
    default: // neutral
      return { hex: '#1fb854', glow: 'bg-green-500/40' }
  }
}

/**
 * Avatar (2.5D Cyber-Droid Companion)
 * Komponen avatar robot otonom MARK berbasis SVG volumetric 3D transforms.
 * Menyediakan pergerakan hidup mandiri, tatapan mata presisi di tengah saat berbicara,
 * responsivitas terhadap 10 mood dan seluruh state MARK tanpa teks tambahan.
 */
const Avatar = ({
  status = 'idle',
  intensity = 0,
  mood = 'neutral',
  onClick = null,
  className = ''
}) => {
  // DOM element references
  const robotRootRef = useRef(null)
  const robotHeadRef = useRef(null)
  const robotBodyRef = useRef(null)
  const handLeftRef = useRef(null)
  const handRightRef = useRef(null)
  const antLeftRef = useRef(null)
  const antRightRef = useRef(null)
  const antBulbLeftRef = useRef(null)
  const antBulbRightRef = useRef(null)
  const earLeftRef = useRef(null)
  const earRightRef = useRef(null)
  const earGlowLeftRef = useRef(null)
  const earGlowRightRef = useRef(null)
  const groundShadowRef = useRef(null)
  const eyesContainerRef = useRef(null)
  const leftEyeRef = useRef(null)
  const rightEyeRef = useRef(null)
  const mouthRef = useRef(null)
  const thrusterRef = useRef(null)
  const desktopReflectionRef = useRef(null)
  const prevStatusRef = useRef(status)

  // State refs for animation loop
  const stateRef = useRef({
    status: 'idle',
    mood: 'neutral',
    intensity: 0,
    isSleeping: false,
    isBlinking: false,
    eyeScaleX: 1,
    eyeScaleY: 1,
    // Physics variables
    rotX: 0,
    rotY: 0,
    rotZ: 0,
    targetRotX: 0,
    targetRotY: 0,
    targetRotZ: 0,
    velRotX: 0,
    velRotY: 0,
    velRotZ: 0,
    // Saccades
    eyeSaccadeX: 0,
    eyeSaccadeY: 0,
    targetSaccadeX: 0,
    targetSaccadeY: 0,
    // Continuous phase accumulators (prevent frequency jump stutter)
    breathPhase: 0,
    swayPhase: 0,
    currentBreathDepth: 7.5,
    currentSwayDepth: 3.5,
    currentRollDepth: 1.0,
    // Quirks
    lastQuirkTime: 0,
    nextQuirkInterval: 2200,
    quirkPitchOffset: 0,
    quirkRollOffset: 0,
    quirkAltitudeOffset: 0,
    targetAltitudeOffset: 0,
    // Dedicated Listening Mode
    listeningSide: 1, // 1 = look right, -1 = look left
    earScale: 1.0,
    // Antenna
    antLeftRot: 0,
    antRightRot: 0,
    antVelLeft: 0,
    antVelRight: 0,
    // Hands
    handLeftX: 0,
    handLeftY: 0,
    handRightX: 0,
    handRightY: 0,
    // Poke physics
    pokeOffsetY: 0,
    pokeVelocityY: 0,
    // Awareness reading scan
    isSeeingDesktop: false,
    desktopForwardZ: 0,
    desktopDownwardY: 0,
    desktopTimeout: null
  })

  // Render face eyes and mouth SVG based on state
  const renderFace = useCallback(() => {
    const s = stateRef.current
    const effectiveStatus = s.isSleeping ? 'sleeping' : s.status
    const color = getMoodColor(s.mood, effectiveStatus).hex

    const leftEye = leftEyeRef.current
    const rightEye = rightEyeRef.current
    const mouth = mouthRef.current
    if (!leftEye || !rightEye || !mouth) return

    // 1. SLEEPING STATE (Closed calm rounded curves)
    if (effectiveStatus === 'sleeping') {
      const sleepEye = `
        <svg viewBox="0 0 40 40" class="w-full h-full">
          <path d="M 8 22 Q 20 25 32 22" fill="none" stroke="${color}" stroke-width="4.5" stroke-linecap="round"/>
        </svg>
      `
      leftEye.innerHTML = sleepEye
      rightEye.innerHTML = sleepEye
      mouth.innerHTML = `
        <svg viewBox="0 0 60 20" class="w-12 h-5">
          <path d="M 22 10 Q 30 14 38 10" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round"/>
        </svg>
      `
      return
    }

    // 2. ERROR STATE (Sharp digital crosses)
    if (effectiveStatus === 'error') {
      const errEye = `
        <svg viewBox="0 0 40 40" class="w-full h-full">
          <line x1="10" y1="10" x2="30" y2="30" stroke="${color}" stroke-width="4.5" stroke-linecap="round"/>
          <line x1="30" y1="10" x2="10" y2="30" stroke="${color}" stroke-width="4.5" stroke-linecap="round"/>
        </svg>
      `
      leftEye.innerHTML = errEye
      rightEye.innerHTML = errEye
      mouth.innerHTML = `
        <svg viewBox="0 0 60 20" class="w-14 h-5">
          <path d="M 15 10 L 22 6 L 30 14 L 38 6 L 45 10" fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round"/>
        </svg>
      `
      return
    }

    // 3. AWARENESS / READING DESKTOP EYES (Focused eyes curved slightly downward)
    if (s.isSeeingDesktop || effectiveStatus === 'awareness' || effectiveStatus === 'nudge') {
      const readingEye = `
        <svg viewBox="0 0 40 40" class="w-full h-full">
          <path d="M 11 15 C 11 9, 29 9, 29 15 C 29 27, 11 27, 11 15 Z" fill="${color}"/>
          <circle cx="20" cy="18" r="3.2" fill="#ffffff"/>
        </svg>
      `
      leftEye.innerHTML = readingEye
      rightEye.innerHTML = readingEye
      mouth.innerHTML = `
        <svg viewBox="0 0 60 20" class="w-8 h-3">
          <line x1="25" y1="10" x2="35" y2="10" stroke="${color}" stroke-width="2" stroke-linecap="round"/>
        </svg>
      `
      return
    }

    // 3b. LISTENING STATE (Focused attentive eyes, dilated alert pupils, inquisitive brows, quiet mouth)
    if (effectiveStatus === 'listening') {
      if (s.isBlinking) {
        const blinkEye = `
          <svg viewBox="0 0 40 40" class="w-full h-full">
            <line x1="8" y1="20" x2="32" y2="20" stroke="${color}" stroke-width="4" stroke-linecap="round"/>
          </svg>
        `
        leftEye.innerHTML = blinkEye
        rightEye.innerHTML = blinkEye
      } else {
        const pupilOffset = (s.listeningSide || 1) * 2.5
        const leftBrowY = s.listeningSide === -1 ? '4' : '7'
        const rightBrowY = s.listeningSide === 1 ? '4' : '7'
        const listeningLeftEye = `
          <svg viewBox="0 0 40 40" class="w-full h-full overflow-visible">
            <!-- Inquisitive attentive brow -->
            <path d="M 8 9 Q 20 ${leftBrowY} 32 8" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" opacity="0.85"/>
            <!-- Attentive stadium aperture -->
            <path d="M 11 14 C 11 8, 29 8, 29 14 C 29 27, 11 27, 11 14 Z" fill="${color}"/>
            <!-- Dilated alert pupil looking toward sound source -->
            <circle cx="${20 + pupilOffset}" cy="16.5" r="4.6" fill="#ffffff" opacity="0.98"/>
            <circle cx="${21 + pupilOffset}" cy="15.2" r="1.8" fill="#ffffff"/>
          </svg>
        `
        const listeningRightEye = `
          <svg viewBox="0 0 40 40" class="w-full h-full overflow-visible">
            <!-- Inquisitive attentive brow -->
            <path d="M 8 8 Q 20 ${rightBrowY} 32 9" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" opacity="0.85"/>
            <!-- Attentive stadium aperture -->
            <path d="M 11 14 C 11 8, 29 8, 29 14 C 29 27, 11 27, 11 14 Z" fill="${color}"/>
            <!-- Dilated alert pupil looking toward sound source -->
            <circle cx="${20 + pupilOffset}" cy="16.5" r="4.6" fill="#ffffff" opacity="0.98"/>
            <circle cx="${21 + pupilOffset}" cy="15.2" r="1.8" fill="#ffffff"/>
          </svg>
        `
        leftEye.innerHTML = listeningLeftEye
        rightEye.innerHTML = listeningRightEye
      }

      // Focused quiet attentive mouth line
      mouth.innerHTML = `
        <svg viewBox="0 0 60 20" class="w-10 h-3">
          <line x1="23" y1="10" x2="37" y2="10" stroke="${color}" stroke-width="2.5" stroke-linecap="round"/>
        </svg>
      `
      return
    }

    // 4. ELASTIC BLINKING STATE (Squash down to thin sleek slit)
    if (s.isBlinking) {
      const blinkEye = `
        <svg viewBox="0 0 40 40" class="w-full h-full">
          <line x1="8" y1="20" x2="32" y2="20" stroke="${color}" stroke-width="4" stroke-linecap="round"/>
        </svg>
      `
      leftEye.innerHTML = blinkEye
      rightEye.innerHTML = blinkEye
    } else if (effectiveStatus === 'speaking' || s.intensity > 0.05) {
      // 5a. SPEAKING STATE: Eyes locked forward with dead-center pupil (X:20, Y:17)
      const speakPupilR = 3.8 + Math.min(1.0, s.intensity * 1.5)
      const speakEye = `
        <svg viewBox="0 0 40 40" class="w-full h-full">
          <path d="M 12 13 C 12 6.5, 28 6.5, 28 13 C 28 27.5, 12 27.5, 12 13 Z" fill="${color}"/>
          <circle cx="20" cy="17" r="${speakPupilR}" fill="#ffffff" opacity="0.98"/>
        </svg>
      `
      leftEye.innerHTML = speakEye
      rightEye.innerHTML = speakEye
    } else {
      // 5b. MOOD SPECIFIC DIGITAL EYES
      let leftEyeSvg = ''
      let rightEyeSvg = ''

      switch (s.mood) {
        case 'joy':
          leftEyeSvg = `
            <svg viewBox="0 0 40 40" class="w-full h-full">
              <path d="M 8 26 Q 20 8 32 26" fill="none" stroke="${color}" stroke-width="5" stroke-linecap="round"/>
            </svg>
          `
          rightEyeSvg = leftEyeSvg
          break

        case 'anger':
          leftEyeSvg = `
            <svg viewBox="0 0 40 40" class="w-full h-full">
              <path d="M 6 12 L 34 22 L 30 30 L 6 18 Z" fill="${color}"/>
            </svg>
          `
          rightEyeSvg = `
            <svg viewBox="0 0 40 40" class="w-full h-full">
              <path d="M 34 12 L 6 22 L 10 30 L 34 18 Z" fill="${color}"/>
            </svg>
          `
          break

        case 'sadness':
          leftEyeSvg = `
            <svg viewBox="0 0 40 40" class="w-full h-full">
              <path d="M 8 16 Q 20 28 32 16" fill="none" stroke="${color}" stroke-width="4.5" stroke-linecap="round"/>
              <circle cx="20" cy="30" r="3.5" fill="#38bdf8"/>
            </svg>
          `
          rightEyeSvg = `
            <svg viewBox="0 0 40 40" class="w-full h-full">
              <path d="M 8 16 Q 20 28 32 16" fill="none" stroke="${color}" stroke-width="4.5" stroke-linecap="round"/>
              <circle cx="20" cy="30" r="3.5" fill="#38bdf8"/>
            </svg>
          `
          break

        case 'fear':
          leftEyeSvg = `
            <svg viewBox="0 0 40 40" class="w-full h-full">
              <circle cx="20" cy="20" r="13" fill="none" stroke="${color}" stroke-width="4"/>
              <circle cx="20" cy="20" r="4.5" fill="${color}"/>
            </svg>
          `
          rightEyeSvg = leftEyeSvg
          break

        case 'anxiety':
          leftEyeSvg = `
            <svg viewBox="0 0 40 40" class="w-full h-full">
              <path d="M 20 20 A 4 4 0 0 1 24 20 A 8 8 0 0 1 16 20 A 12 12 0 0 1 28 20" fill="none" stroke="${color}" stroke-width="3.5" stroke-linecap="round"/>
            </svg>
          `
          rightEyeSvg = leftEyeSvg
          break

        case 'envy':
          leftEyeSvg = `
            <svg viewBox="0 0 40 40" class="w-full h-full">
              <path d="M 6 18 Q 20 12 34 20 Q 20 28 6 18 Z" fill="${color}" opacity="0.4"/>
              <line x1="18" y1="12" x2="22" y2="28" stroke="${color}" stroke-width="4" stroke-linecap="round"/>
            </svg>
          `
          rightEyeSvg = `
            <svg viewBox="0 0 40 40" class="w-full h-full">
              <path d="M 6 20 Q 20 12 34 18 Q 20 28 6 20 Z" fill="${color}" opacity="0.4"/>
              <line x1="22" y1="12" x2="18" y2="28" stroke="${color}" stroke-width="4" stroke-linecap="round"/>
            </svg>
          `
          break

        case 'embarrassment':
          leftEyeSvg = `
            <svg viewBox="0 0 40 40" class="w-full h-full">
              <path d="M 12 14 L 28 22 L 12 30" fill="none" stroke="${color}" stroke-width="4" stroke-linecap="round"/>
            </svg>
          `
          rightEyeSvg = `
            <svg viewBox="0 0 40 40" class="w-full h-full">
              <path d="M 28 14 L 12 22 L 28 30" fill="none" stroke="${color}" stroke-width="4" stroke-linecap="round"/>
            </svg>
          `
          break

        case 'ennui':
          leftEyeSvg = `
            <svg viewBox="0 0 40 40" class="w-full h-full">
              <line x1="8" y1="18" x2="32" y2="18" stroke="${color}" stroke-width="4.5" stroke-linecap="round"/>
              <circle cx="20" cy="24" r="5" fill="${color}"/>
            </svg>
          `
          rightEyeSvg = leftEyeSvg
          break

        case 'disgust':
          leftEyeSvg = `
            <svg viewBox="0 0 40 40" class="w-full h-full">
              <line x1="10" y1="20" x2="30" y2="16" stroke="${color}" stroke-width="4" stroke-linecap="round"/>
            </svg>
          `
          rightEyeSvg = `
            <svg viewBox="0 0 40 40" class="w-full h-full">
              <circle cx="20" cy="20" r="10" fill="none" stroke="${color}" stroke-width="3.5"/>
              <circle cx="20" cy="20" r="4" fill="${color}"/>
            </svg>
          `
          break

        default: // Neutral: Modern Minimalist Curved Stadium Eye with Centered Pupil (X:20, Y:17)
          leftEyeSvg = `
            <svg viewBox="0 0 40 40" class="w-full h-full">
              <path d="M 12 13 C 12 6.5, 28 6.5, 28 13 C 28 27.5, 12 27.5, 12 13 Z" fill="${color}"/>
              <circle cx="20" cy="17" r="3.6" fill="#ffffff" opacity="0.95"/>
            </svg>
          `
          rightEyeSvg = leftEyeSvg
          break
      }

      leftEye.innerHTML = leftEyeSvg
      rightEye.innerHTML = rightEyeSvg
    }

    // 6. MOUTH / LIP-FLAP
    if (effectiveStatus === 'speaking' || s.intensity > 0.05) {
      const scale = Math.max(0.2, s.intensity)
      const openH = Math.round(5 + scale * 16)
      const openW = Math.round(12 + scale * 20)

      mouth.innerHTML = `
        <svg viewBox="0 0 60 30" class="w-14 h-6">
          <ellipse cx="30" cy="15" rx="${openW / 2}" ry="${openH / 2}" fill="${color}" opacity="0.3"/>
          <ellipse cx="30" cy="15" rx="${Math.max(2, openW / 2 - 2)}" ry="${Math.max(2, openH / 2 - 2)}" fill="#ffffff"/>
        </svg>
      `
    } else if (effectiveStatus === 'thinking') {
      mouth.innerHTML = `
        <div class="flex items-center gap-1.5 py-1">
          <span class="w-1.5 h-1.5 rounded-full bg-[#1fb854] animate-ping"></span>
          <span class="w-1.5 h-1.5 rounded-full bg-[#1fb854] animate-ping [animation-delay:0.2s]"></span>
          <span class="w-1.5 h-1.5 rounded-full bg-[#1fb854] animate-ping [animation-delay:0.4s]"></span>
        </div>
      `
    } else {
      let mouthSvg = ''
      switch (s.mood) {
        case 'joy':
          mouthSvg = `<path d="M 20 8 Q 30 20 40 8" fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round"/>`
          break
        case 'anger':
          mouthSvg = `<path d="M 20 18 Q 30 10 40 18" fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round"/>`
          break
        case 'sadness':
          mouthSvg = `<path d="M 22 18 Q 30 10 38 18" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round"/>`
          break
        case 'anxiety':
          mouthSvg = `<path d="M 20 14 Q 25 10 30 14 Q 35 18 40 14" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round"/>`
          break
        case 'envy':
          mouthSvg = `<path d="M 24 16 Q 32 18 40 12" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round"/>`
          break
        default:
          mouthSvg = `<line x1="24" y1="14" x2="36" y2="14" stroke="${color}" stroke-width="2.5" stroke-linecap="round"/>`
          break
      }
      mouth.innerHTML = `
        <svg viewBox="0 0 60 26" class="w-12 h-4">
          ${mouthSvg}
        </svg>
      `
    }
  }, [])

  // Update squash & stretch scales on eye boxes
  const updateEyeMesh = useCallback(() => {
    const s = stateRef.current
    if (leftEyeRef.current) {
      leftEyeRef.current.style.transform = `scale(${s.eyeScaleX}, ${s.eyeScaleY})`
    }
    if (rightEyeRef.current) {
      rightEyeRef.current.style.transform = `scale(${s.eyeScaleX}, ${s.eyeScaleY})`
    }
  }, [])

  // Sync props to ref
  useEffect(() => {
    if (status === 'listening' && prevStatusRef.current !== 'listening') {
      // Pick random side: 1 for right, -1 for left
      stateRef.current.listeningSide = Math.random() > 0.5 ? 1 : -1
    }
    prevStatusRef.current = status

    stateRef.current.status = status
    stateRef.current.mood = mood
    stateRef.current.intensity = intensity

    const isAwareness = status === 'awareness' || status === 'nudge'
    stateRef.current.isSeeingDesktop = isAwareness

    if (desktopReflectionRef.current) {
      desktopReflectionRef.current.style.opacity = isAwareness ? '1' : '0'
    }

    if (antBulbLeftRef.current && antBulbRightRef.current) {
      if (isAwareness || status === 'listening') {
        antBulbLeftRef.current.classList.add('animate-pulse')
        antBulbRightRef.current.classList.add('animate-pulse')
      } else {
        antBulbLeftRef.current.classList.remove('animate-pulse')
        antBulbRightRef.current.classList.remove('animate-pulse')
      }
    }

    if (isAwareness) {
      stateRef.current.antVelLeft = -14
      stateRef.current.antVelRight = 14
      stateRef.current.targetSaccadeX = -6
      stateRef.current.targetSaccadeY = 2
      setTimeout(() => {
        stateRef.current.targetSaccadeX = 6
      }, 900)
      setTimeout(() => {
        stateRef.current.targetSaccadeX = 0
        stateRef.current.targetSaccadeY = 0
      }, 2200)
    }

    // Immediate face re-render upon status / mood changes (colors applied strictly to face)
    renderFace()
  }, [status, mood, renderFace])

  // Direct high-speed intensity listener (avoids parent React re-renders)
  useEffect(() => {
    const handleIntensityEvent = (e) => {
      stateRef.current.intensity = typeof e.detail === 'number' ? e.detail : 0
    }
    window.addEventListener('mark-intensity', handleIntensityEvent)
    return () => window.removeEventListener('mark-intensity', handleIntensityEvent)
  }, [])

  // Listen for sleep state from useAwareness
  useEffect(() => {
    const handleSleepingEvent = (e) => {
      const sleeping = Boolean(e.detail?.isSleeping)
      stateRef.current.isSleeping = sleeping
      renderFace()
    }
    window.addEventListener('mark:sleeping', handleSleepingEvent)
    return () => window.removeEventListener('mark:sleeping', handleSleepingEvent)
  }, [renderFace])

  // Blinking loop with natural squash & stretch
  useEffect(() => {
    let blinkTimer = null

    const triggerBlink = () => {
      const s = stateRef.current
      if (s.isSleeping || s.status === 'sleeping') {
        blinkTimer = setTimeout(triggerBlink, 3000)
        return
      }

      s.isBlinking = true
      s.eyeScaleX = 1.15
      s.eyeScaleY = 0.15
      updateEyeMesh()
      renderFace()

      setTimeout(() => {
        s.isBlinking = false
        s.eyeScaleX = 0.95
        s.eyeScaleY = 1.1
        updateEyeMesh()
        renderFace()

        setTimeout(() => {
          s.eyeScaleX = 1
          s.eyeScaleY = 1
          updateEyeMesh()
        }, 80)

        // 20% chance of natural double-blink
        if (Math.random() < 0.2) {
          setTimeout(() => {
            s.isBlinking = true
            s.eyeScaleY = 0.15
            updateEyeMesh()
            renderFace()
            setTimeout(() => {
              s.isBlinking = false
              s.eyeScaleY = 1
              updateEyeMesh()
              renderFace()
            }, 90)
          }, 110)
        }

        const nextDelay = 2600 + Math.random() * 3200
        blinkTimer = setTimeout(triggerBlink, nextDelay)
      }, 120)
    }

    blinkTimer = setTimeout(triggerBlink, 1500)
    return () => clearTimeout(blinkTimer)
  }, [renderFace, updateEyeMesh])

  // Autonomous quirks loop (tilt, nod, stretch, glance)
  const updateAutonomousQuirks = useCallback((now) => {
    const s = stateRef.current
    if (
      s.isSeeingDesktop ||
      s.status === 'speaking' ||
      s.status === 'listening' ||
      s.isSleeping ||
      s.status === 'sleeping'
    ) {
      s.targetRotY = 0
      s.targetRotZ = 0
      s.targetSaccadeX = 0
      s.targetSaccadeY = 0
      s.quirkPitchOffset = 0
      s.quirkRollOffset = 0
      s.targetAltitudeOffset = 0
      return
    }

    if (now - s.lastQuirkTime >= s.nextQuirkInterval) {
      s.lastQuirkTime = now
      s.nextQuirkInterval = 2000 + Math.random() * 1200

      const roll = Math.random()
      // 1. Curious Head Tilt (Memiringkan kepala penasaran)
      if (roll < 0.3) {
        s.quirkRollOffset = Math.random() > 0.5 ? 10 : -10
        s.quirkPitchOffset = -4
        s.targetRotY = (Math.random() - 0.5) * 8
        s.targetSaccadeX = s.quirkRollOffset * 0.4
        setTimeout(() => {
          s.quirkRollOffset = 0
          s.quirkPitchOffset = 0
          s.targetRotY = 0
          s.targetSaccadeX = 0
        }, 1200)
      }
      // 2. Subtle Listening Nod (Mengangguk kecil menyimak)
      else if (roll < 0.55) {
        s.quirkPitchOffset = -8
        s.quirkRollOffset = 0
        setTimeout(() => {
          s.quirkPitchOffset = 0
        }, 400)
      }
      // 3. Floating Stretch Breath (Helaan nafas apung halus)
      else if (roll < 0.75) {
        s.targetAltitudeOffset = -10
        s.quirkPitchOffset = 3
        setTimeout(() => {
          s.targetAltitudeOffset = 0
          s.quirkPitchOffset = 0
        }, 1000)
      }
      // 4. Casual Glance Around (Menoleh santai)
      else {
        s.targetRotY = Math.random() > 0.5 ? 12 : -12
        s.quirkPitchOffset = -2
        s.quirkRollOffset = (Math.random() - 0.5) * 4
        s.targetSaccadeX = s.targetRotY * 0.35
        setTimeout(() => {
          s.targetRotY = 0
          s.targetSaccadeX = 0
          s.quirkPitchOffset = 0
          s.quirkRollOffset = 0
        }, 1400)
      }
    }
  }, [])

  // Handle interactive poke click
  const handlePoke = useCallback(() => {
    const s = stateRef.current
    s.pokeVelocityY = -26
    s.velRotY += Math.random() > 0.5 ? 14 : -14
    s.antVelLeft = -28
    s.antVelRight = 28

    // Trigger immediate blink
    s.isBlinking = true
    s.eyeScaleY = 0.15
    updateEyeMesh()
    renderFace()
    setTimeout(() => {
      s.isBlinking = false
      s.eyeScaleY = 1
      updateEyeMesh()
      renderFace()
    }, 120)

    if (typeof onClick === 'function') {
      onClick()
    }
  }, [onClick, renderFace, updateEyeMesh])

  // Main 60 FPS requestAnimationFrame physics ticker
  useEffect(() => {
    let animId
    let prevTime = performance.now()
    stateRef.current.lastQuirkTime = performance.now()

    renderFace()

    const updateFrame = (now) => {
      const dt = Math.min(0.05, (now - prevTime) / 1000)
      prevTime = now
      const t = now * 0.001
      const s = stateRef.current
      const effectiveStatus = s.isSleeping ? 'sleeping' : s.status

      // 1. Autonomous quirks
      updateAutonomousQuirks(now)

      // 2. Eye saccades lerp (locked forward during speaking, attentive during listening)
      if (s.status === 'speaking') {
        s.targetSaccadeX = 0
        s.targetSaccadeY = 0
      } else if (effectiveStatus === 'listening') {
        s.targetSaccadeX = (s.listeningSide || 1) * 3
        s.targetSaccadeY = -1
      }
      const saccadeSpeed = s.status === 'speaking' ? 0.35 : 0.16
      s.eyeSaccadeX += (s.targetSaccadeX - s.eyeSaccadeX) * saccadeSpeed
      s.eyeSaccadeY += (s.targetSaccadeY - s.eyeSaccadeY) * saccadeSpeed

      // 3. Multi-Harmonic organic breathing & sway (Continuous phase accumulator)
      let breathSpeed = 1.6
      let breathDepth = 7.5
      let swayDepth = 3.5
      let rollDepth = 1.0

      if (effectiveStatus === 'sleeping') {
        breathSpeed = 0.8
        breathDepth = 4.5
        swayDepth = 1.2
      } else if (effectiveStatus === 'speaking') {
        breathSpeed = 2.2
        breathDepth = 6.5
        swayDepth = 0 // Pure straight forward
        rollDepth = 0
      } else if (effectiveStatus === 'listening') {
        breathSpeed = 1.3
        breathDepth = 5.5
        swayDepth = 1.2
        rollDepth = 0.5
      } else if (s.isSeeingDesktop) {
        breathSpeed = 1.8
        breathDepth = 5
      } else if (effectiveStatus === 'thinking') {
        breathSpeed = 1.2
      }

      // Continuous phase accumulation - prevents frequency step jump stutter
      s.breathPhase = (s.breathPhase + dt * breathSpeed) % (Math.PI * 2)
      s.swayPhase = (s.swayPhase + dt * breathSpeed * 0.65) % (Math.PI * 2)

      // Lerp depth amplitudes smoothly
      s.currentBreathDepth += (breathDepth - s.currentBreathDepth) * dt * 3.5
      s.currentSwayDepth += (swayDepth - s.currentSwayDepth) * dt * 3.5
      s.currentRollDepth += (rollDepth - s.currentRollDepth) * dt * 3.5

      // Pure sinusoidal float (Zero hitching, derivatives are C-infinity smooth)
      const harmonicY = Math.sin(s.breathPhase) * s.currentBreathDepth
      const harmonicX = Math.cos(s.swayPhase) * s.currentSwayDepth
      const harmonicRoll = Math.sin(s.breathPhase * 0.5) * s.currentRollDepth

      const breathScaleY = 1 + harmonicY * 0.0016
      const breathScaleX = 1 - harmonicY * 0.0008

      // Damped quirk altitude offset
      s.quirkAltitudeOffset += (s.targetAltitudeOffset - s.quirkAltitudeOffset) * dt * 4

      // Poke spring dampening
      s.pokeOffsetY += s.pokeVelocityY * dt * 30
      s.pokeVelocityY += (0 - s.pokeOffsetY) * 0.25 - s.pokeVelocityY * 0.2

      // Damped desktop look transitions
      const targetDesktopForwardZ = s.isSeeingDesktop ? 35 : 0
      const targetDesktopDownwardY = s.isSeeingDesktop ? -12 : 0
      s.desktopForwardZ += (targetDesktopForwardZ - s.desktopForwardZ) * dt * 6
      s.desktopDownwardY += (targetDesktopDownwardY - s.desktopDownwardY) * dt * 6

      // 4. Spring-damper for head rotation (Pitch, Yaw, Roll)
      let addPitch = effectiveStatus === 'sleeping' ? 14 : 0
      let addRoll = effectiveStatus === 'thinking' ? 7 : s.mood === 'joy' ? 3 : 0

      if (s.isSeeingDesktop) {
        addPitch = -16
      } else if (effectiveStatus === 'speaking') {
        const speakNod = Math.sin(t * 7.5) * (s.intensity * 2.2)
        addPitch = -1.5 + speakNod
      }

      let effectiveTargetX = s.targetRotX + s.quirkPitchOffset + addPitch
      let effectiveTargetY = s.targetRotY
      let effectiveTargetZ = s.targetRotZ + s.quirkRollOffset + addRoll

      if (effectiveStatus === 'speaking') {
        effectiveTargetX = addPitch
        effectiveTargetY = 0 // Strictly face forward
        effectiveTargetZ = 0 // Strictly upright
      } else if (effectiveStatus === 'listening') {
        // Dedicated listening posture: turns to random side with curious cocked ear tilt
        const side = s.listeningSide || 1
        effectiveTargetX = -4 // slightly cocked chin
        effectiveTargetY = side * 20 // turn 20 deg to chosen side
        effectiveTargetZ = side * -6 // tilt ear towards user
      } else if (s.isSeeingDesktop) {
        effectiveTargetX = -14 + addPitch
        effectiveTargetY = Math.sin(t * 1.8) * 4
        effectiveTargetZ = 0
      }

      // Spring damper calculation
      s.velRotX += ((effectiveTargetX - s.rotX) * 140 - s.velRotX * 16) * dt
      s.velRotY += ((effectiveTargetY - s.rotY) * 140 - s.velRotY * 16) * dt
      s.velRotZ += ((effectiveTargetZ - s.rotZ) * 140 - s.velRotZ * 16) * dt
      s.rotX += s.velRotX * dt
      s.rotY += s.velRotY * dt
      s.rotZ += s.velRotZ * dt

      // 5. Apply Rigid Compound Transforms around Throat Pivot
      const totalY = harmonicY + s.pokeOffsetY + s.desktopDownwardY + s.quirkAltitudeOffset
      if (robotRootRef.current) {
        robotRootRef.current.style.transform = `translate3d(${harmonicX}px, ${totalY}px, ${s.desktopForwardZ}px) scale3d(${breathScaleX}, ${breathScaleY}, 1)`
      }

      // Head: Rotates smoothly with pitch, yaw, and harmonic roll around throat base (130px 165px)
      if (robotHeadRef.current) {
        robotHeadRef.current.style.transform = `rotateX(${s.rotX}deg) rotateY(${s.rotY}deg) rotateZ(${s.rotZ + harmonicRoll}deg)`
      }

      // Torso: Follows directly beneath the throat socket without tearing
      if (robotBodyRef.current) {
        const torsoRotX = s.rotX * 0.35
        const torsoRotY = effectiveStatus === 'speaking' ? 0 : s.rotY * 0.35
        robotBodyRef.current.style.transform = `translateZ(-5px) rotateX(${torsoRotX}deg) rotateY(${torsoRotY}deg)`
      }

      // Ground Shadow
      if (groundShadowRef.current) {
        const shadowScale = Math.max(0.65, 1 - totalY * 0.012)
        const shadowOpacity = Math.max(0.3, 0.75 + totalY * 0.012)
        groundShadowRef.current.style.transform = `translateZ(-60px) rotateX(75deg) scale(${shadowScale})`
        groundShadowRef.current.style.opacity = shadowOpacity
      }

      // 6. Ears Enlarge & Acoustic Pulse Animation
      const targetEarScale =
        effectiveStatus === 'listening'
          ? 1.55 + Math.sin(t * 6) * 0.04 + (s.intensity || 0) * 0.35
          : 1.0
      s.earScale += (targetEarScale - s.earScale) * dt * 10

      if (earLeftRef.current) {
        earLeftRef.current.style.transform = `scale(${s.earScale})`
      }
      if (earRightRef.current) {
        earRightRef.current.style.transform = `scale(${s.earScale})`
      }
      if (earGlowLeftRef.current && earGlowRightRef.current) {
        const earOpacity =
          effectiveStatus === 'listening' ? Math.min(1.0, 0.75 + (s.intensity || 0) * 0.5) : 0.25
        earGlowLeftRef.current.style.opacity = earOpacity
        earGlowRightRef.current.style.opacity = earOpacity
      }

      // 7. Antenna Spring Damping
      let antTargetLeft = -s.velRotY * 0.35
      let antTargetRight = -s.velRotY * 0.35

      if (effectiveStatus === 'speaking') {
        antTargetLeft = Math.sin(t * 6) * (s.intensity * 6)
        antTargetRight = -Math.sin(t * 6) * (s.intensity * 6)
      } else if (effectiveStatus === 'listening') {
        const side = s.listeningSide || 1
        if (side === -1) {
          // Looking left: left antenna perks up forward/outward, right antenna perks slightly
          antTargetLeft = 24
          antTargetRight = -6
        } else {
          // Looking right: right antenna perks up forward/outward, left antenna perks slightly
          antTargetLeft = 6
          antTargetRight = -24
        }
      } else if (effectiveStatus === 'thinking') {
        antTargetLeft = -s.velRotY * 0.35 - 15
        antTargetRight = -s.velRotY * 0.35 + 15
      }

      s.antVelLeft += (antTargetLeft - s.antLeftRot) * 200 * dt - s.antVelLeft * 14 * dt
      s.antVelRight += (antTargetRight - s.antRightRot) * 200 * dt - s.antVelRight * 14 * dt
      s.antLeftRot += s.antVelLeft * dt
      s.antRightRot += s.antVelRight * dt

      if (antLeftRef.current) antLeftRef.current.style.transform = `rotate(${s.antLeftRot}deg)`
      if (antRightRef.current) antRightRef.current.style.transform = `rotate(${s.antRightRot}deg)`

      // 8. Floating Hand Physics
      let targetHandLY = Math.sin(s.breathPhase * 0.9) * 5
      let targetHandLX = Math.cos(s.breathPhase * 0.9) * 2.5
      let targetHandRY = Math.sin(s.breathPhase * 0.9 + 1.2) * 5
      let targetHandRX = Math.cos(s.breathPhase * 0.9 + 1.2) * 2.5

      if (s.isSeeingDesktop) {
        targetHandLY = -40
        targetHandLX = 12
        targetHandRY = -40
        targetHandRX = -12
      } else if (effectiveStatus === 'listening') {
        const side = s.listeningSide || 1
        if (side === -1) {
          // Left ear forward: left hand raises slightly towards cheek/ear in listening posture
          targetHandLY = -20
          targetHandLX = 14
          targetHandRY = 2
          targetHandRX = -3
        } else {
          // Right ear forward: right hand raises slightly towards cheek/ear in listening posture
          targetHandRY = -20
          targetHandRX = -14
          targetHandLY = 2
          targetHandLX = 3
        }
      } else if (effectiveStatus === 'thinking') {
        targetHandLY = -34
        targetHandLX = 16
      } else if (effectiveStatus === 'speaking') {
        const voicePulse = Math.sin(t * 8) * (s.intensity * 12)
        targetHandLY = -10 + voicePulse
        targetHandLX = -4
        targetHandRY = -10 - voicePulse
        targetHandRX = 4
      } else if (effectiveStatus === 'sleeping') {
        targetHandLY = 18
        targetHandRY = 18
      } else if (s.mood === 'joy') {
        targetHandLY -= 8
        targetHandRY -= 8
      }

      s.handLeftY += (targetHandLY - s.handLeftY) * 0.16
      s.handLeftX += (targetHandLX - s.handLeftX) * 0.16
      s.handRightY += (targetHandRY - s.handRightY) * 0.16
      s.handRightX += (targetHandRX - s.handRightX) * 0.16

      if (handLeftRef.current) {
        handLeftRef.current.style.transform = `translate3d(${s.handLeftX}px, ${s.handLeftY}px, ${
          s.isSeeingDesktop ? 30 : 18
        }px) rotateZ(${-s.rotY * 0.2}deg)`
      }
      if (handRightRef.current) {
        handRightRef.current.style.transform = `translate3d(${s.handRightX}px, ${s.handRightY}px, ${
          s.isSeeingDesktop ? 30 : 18
        }px) rotateZ(${-s.rotY * 0.2}deg)`
      }

      // 8. Eyes Parallax - firmly focused forward on user when speaking
      if (eyesContainerRef.current) {
        const finalEyeX = effectiveStatus === 'speaking' ? 0 : s.rotY * 0.35 + s.eyeSaccadeX
        const finalEyeY = effectiveStatus === 'speaking' ? 0 : -s.rotX * 0.25 + s.eyeSaccadeY
        eyesContainerRef.current.style.transform = `translate3d(${finalEyeX}px, ${finalEyeY}px, 10px)`
      }

      // Update face elements if speaking or dynamic
      if (effectiveStatus === 'speaking') {
        renderFace()
      }

      animId = requestAnimationFrame(updateFrame)
    }

    animId = requestAnimationFrame(updateFrame)
    return () => cancelAnimationFrame(animId)
  }, [renderFace, updateAutonomousQuirks])

  return (
    <div
      className={`relative w-[320px] h-[440px] [perspective:1000px] select-none ${className}`}
      onClick={handlePoke}
      title="MARK AI Companion"
    >
      <style>{`
        @keyframes avatarScanline {
          0% { transform: translateY(-100%); }
          100% { transform: translateY(160%); }
        }
        @keyframes avatarGlitchShake {
          0% { transform: translate(0, 0); }
          25% { transform: translate(-3px, 2px); }
          50% { transform: translate(3px, -2px); }
          75% { transform: translate(-2px, -1px); }
          100% { transform: translate(0, 0); }
        }
        @keyframes avatarCoreHeartbeat {
          0%, 100% { transform: scale(1); opacity: 0.9; }
          15% { transform: scale(1.2); opacity: 1; }
          30% { transform: scale(1.05); opacity: 0.92; }
          45% { transform: scale(1.14); opacity: 0.98; }
          60% { transform: scale(1); opacity: 0.9; }
        }
        .avatar-preserve-3d {
          transform-style: preserve-3d;
        }
        .avatar-core-beat {
          animation: avatarCoreHeartbeat 2.4s cubic-bezier(0.4, 0, 0.6, 1) infinite;
        }
        .avatar-eye-mesh {
          transition: transform 120ms cubic-bezier(0.2, 0.8, 0.2, 1);
          transform-origin: center center;
        }
      `}</style>

      {/* Robot Root Pivot (Handles organic breathing, floating, & poke bounce) */}
      <div ref={robotRootRef} className="relative w-full h-full avatar-preserve-3d cursor-pointer">
        {/* ── 1. UNIFIED 3D HEAD ASSEMBLY (Throat pivot joint 130px 165px) ── */}
        <div
          ref={robotHeadRef}
          className="absolute left-[30px] top-[18px] w-[260px] h-[180px] avatar-preserve-3d"
          style={{ transformOrigin: '130px 165px' }}
        >
          {/* Background Helmet Shell & Antennas (Single unified SVG with 3D gradients) */}
          <svg
            viewBox="0 0 260 180"
            className="absolute inset-0 w-full h-full pointer-events-none drop-shadow-[0_16px_36px_rgba(0,0,0,0.9)]"
            style={{ overflow: 'visible' }}
          >
            <defs>
              <radialGradient id="avatarHelmetGrad" cx="38%" cy="32%" r="68%">
                <stop offset="0%" stopColor="#243f30" />
                <stop offset="45%" stopColor="#14241c" />
                <stop offset="100%" stopColor="#080e0a" />
              </radialGradient>
              <linearGradient id="avatarHelmetRim" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#2a4738" />
                <stop offset="100%" stopColor="#14241c" />
              </linearGradient>
              <filter id="avatar-neon-glow" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="3" result="blur" />
                <feComposite in="SourceGraphic" in2="blur" operator="over" />
              </filter>
            </defs>

            {/* Left Wing Antenna */}
            <g ref={antLeftRef} className="origin-[55px_90px]">
              <path
                d="M 55 90 L 16 40 L 22 24 L 46 48 Z"
                fill="#13221b"
                stroke="#19362d"
                strokeWidth="2.5"
              />
              <circle
                ref={antBulbLeftRef}
                cx="19"
                cy="32"
                r="7"
                fill="#ffffff"
                filter="url(#avatar-neon-glow)"
                opacity="0.92"
              />
              <circle cx="19" cy="32" r="2.5" fill="#ffffff" opacity="0.98" />
            </g>

            {/* Right Wing Antenna */}
            <g ref={antRightRef} className="origin-[205px_90px]">
              <path
                d="M 205 90 L 244 40 L 238 24 L 214 48 Z"
                fill="#13221b"
                stroke="#19362d"
                strokeWidth="2.5"
              />
              <circle
                ref={antBulbRightRef}
                cx="241"
                cy="32"
                r="7"
                fill="#ffffff"
                filter="url(#avatar-neon-glow)"
                opacity="0.92"
              />
              <circle cx="241" cy="32" r="2.5" fill="#ffffff" opacity="0.98" />
            </g>

            {/* Main Helmet Curved 3D Head Shell (Sleek, Clean, No badges/text) */}
            <ellipse
              cx="130"
              cy="95"
              rx="78"
              ry="70"
              fill="url(#avatarHelmetGrad)"
              stroke="url(#avatarHelmetRim)"
              strokeWidth="3"
            />

            {/* Chin Bevel (Hugs neck seamlessly) */}
            <path d="M 104 156 Q 130 166 156 156 L 150 164 Q 130 170 110 164 Z" fill="#080e0a" />

            {/* Left Earphone Side Pod (Enlarges & illuminates during listening) */}
            <g ref={earLeftRef} className="origin-[52px_95px] avatar-preserve-3d">
              <rect
                x="47"
                y="78"
                width="10"
                height="34"
                rx="5"
                fill="#19362d"
                stroke="#254a3e"
                strokeWidth="2"
              />
              <rect
                ref={earGlowLeftRef}
                x="50"
                y="84"
                width="4"
                height="22"
                rx="2"
                fill="#ffffff"
                className="transition-opacity duration-300"
                filter="url(#avatar-neon-glow)"
                opacity="0.35"
              />
            </g>

            {/* Right Earphone Side Pod (Enlarges & illuminates during listening) */}
            <g ref={earRightRef} className="origin-[208px_95px] avatar-preserve-3d">
              <rect
                x="203"
                y="78"
                width="10"
                height="34"
                rx="5"
                fill="#19362d"
                stroke="#254a3e"
                strokeWidth="2"
              />
              <rect
                ref={earGlowRightRef}
                x="206"
                y="84"
                width="4"
                height="22"
                rx="2"
                fill="#ffffff"
                className="transition-opacity duration-300"
                filter="url(#avatar-neon-glow)"
                opacity="0.35"
              />
            </g>

            {/* Forehead Ambient Light Sensor Dot */}
            <circle cx="130" cy="36" r="3" fill="#ffffff" opacity="0.8" />
          </svg>

          {/* Deep Curved 3D Glass Visor Screen */}
          <div
            className="absolute left-[56px] top-[40px] w-[148px] h-[108px] rounded-[34px] bg-gradient-to-b from-[#0a140f] to-[#040806] border-2 border-[#19362d] overflow-hidden shadow-[inset_0_4px_22px_rgba(0,0,0,0.98)] avatar-preserve-3d flex items-center justify-center pointer-events-none"
            style={{ transform: 'translateZ(16px)' }}
          >
            {/* Minimalist Desktop Wireframe Reflection (Active during Awareness / Melihat Layar) */}
            <div
              ref={desktopReflectionRef}
              className="absolute inset-0 pointer-events-none opacity-0 transition-opacity duration-500 flex flex-col p-3 z-0"
            >
              <div className="w-full h-3 border-b border-[#1fb854]/30 flex items-center justify-between px-1 pb-1">
                <div className="flex gap-1">
                  <div className="w-1.5 h-1.5 rounded-full bg-[#1fb854]/50" />
                  <div className="w-1.5 h-1.5 rounded-full bg-[#1fb854]/30" />
                </div>
                <div className="w-6 h-1 rounded-full bg-[#1fb854]/25" />
              </div>
              <div className="flex-1 flex flex-col gap-1 pt-1.5 px-0.5 opacity-40">
                <div className="w-3/4 h-1 rounded bg-[#1fb854]/40" />
                <div className="w-1/2 h-1 rounded bg-[#1fb854]/30" />
                <div className="w-5/6 h-1 rounded bg-[#1fb854]/40" />
                <div className="w-2/3 h-1 rounded bg-[#1fb854]/30" />
                <div className="w-4/5 h-1 rounded bg-[#1fb854]/40" />
              </div>
              <div className="absolute inset-x-0 top-0 h-4 bg-gradient-to-b from-[#1fb854]/15 to-transparent pointer-events-none animate-[avatarScanline_2.5s_linear_infinite]" />
            </div>

            {/* Specular Curved Highlight */}
            <div className="absolute -top-10 -left-10 w-56 h-30 bg-gradient-to-b from-white/12 via-white/3 to-transparent rotate-[-22deg] pointer-events-none rounded-full blur-[1px]" />

            {/* LED Cyber Face (Elastic Eyes + Animated Mouth) */}
            <div
              className="relative w-full h-full flex flex-col items-center justify-center z-10 avatar-preserve-3d"
              style={{ transform: 'translateZ(10px)' }}
            >
              {/* Eyes Container */}
              <div ref={eyesContainerRef} className="flex items-center justify-center gap-7">
                <div
                  ref={leftEyeRef}
                  className="w-10 h-10 flex items-center justify-center avatar-eye-mesh"
                />
                <div
                  ref={rightEyeRef}
                  className="w-10 h-10 flex items-center justify-center avatar-eye-mesh"
                />
              </div>

              {/* Mouth Container */}
              <div ref={mouthRef} className="h-5 flex items-center justify-center mt-1" />
            </div>
          </div>
        </div>

        {/* ── 2. BODY CHASSIS & INTEGRATED NECK COLLAR (Centered: X: 95px, Y: 172px) ── */}
        <div
          ref={robotBodyRef}
          className="absolute left-[95px] top-[172px] w-[130px] h-[126px] avatar-preserve-3d"
          style={{
            transformOrigin: '65px 12px',
            transform: 'translateZ(-5px)'
          }}
        >
          <svg
            viewBox="0 0 130 126"
            className="w-full h-full drop-shadow-[0_12px_30px_rgba(0,0,0,0.85)]"
          >
            <defs>
              <radialGradient id="avatarBodyGrad" cx="50%" cy="40%" r="65%">
                <stop offset="0%" stopColor="#1a2e23" />
                <stop offset="60%" stopColor="#13221b" />
                <stop offset="100%" stopColor="#080e0a" />
              </radialGradient>
            </defs>

            {/* Integrated Cyber Neck Socket */}
            <ellipse
              cx="65"
              cy="14"
              rx="26"
              ry="9"
              fill="#0d1611"
              stroke="#19362d"
              strokeWidth="2.5"
            />
            <ellipse cx="65" cy="14" rx="16" ry="5" fill="#080e0a" />

            {/* Body Outer Shell */}
            <path
              d="M 32 30 L 98 30 C 114 30, 120 50, 114 90 C 108 113, 88 120, 65 120 C 42 120, 22 113, 16 90 C 10 50, 16 30, 32 30 Z"
              fill="url(#avatarBodyGrad)"
              stroke="#19362d"
              strokeWidth="3"
            />

            {/* Cyber Armor Plates */}
            <path
              d="M 30 45 L 56 45 L 52 80 L 28 75 Z"
              fill="#19362d"
              stroke="#254a3e"
              strokeWidth="1.5"
            />
            <path
              d="M 100 45 L 74 45 L 78 80 L 102 75 Z"
              fill="#19362d"
              stroke="#254a3e"
              strokeWidth="1.5"
            />

            {/* Central Arc Reactor Heartbeat */}
            <circle cx="65" cy="70" r="14" fill="#09120e" stroke="#19362d" strokeWidth="2.5" />
            <g className="avatar-core-beat origin-[65px_70px]">
              <circle
                cx="65"
                cy="70"
                r="9"
                fill="#ffffff"
                filter="url(#avatar-neon-glow)"
                opacity="0.88"
              />
              <circle cx="65" cy="70" r="4.5" fill="#ffffff" opacity="0.98" />
            </g>

            {/* Power Telemetry Bars */}
            <rect x="50" y="95" width="6" height="3" rx="1.5" fill="#ffffff" opacity="0.75" />
            <rect x="59" y="95" width="6" height="3" rx="1.5" fill="#ffffff" opacity="0.75" />
            <rect x="68" y="95" width="6" height="3" rx="1.5" fill="#ffffff" opacity="0.75" />
            <rect x="77" y="95" width="6" height="3" rx="1.5" fill="#ffffff" opacity="0.75" />

            {/* Bottom Thruster Vent Nozzle */}
            <path d="M 50 117 L 80 117 L 74 125 L 56 125 Z" fill="#0d1712" />
          </svg>
        </div>

        {/* ── 3. FLOATING HANDS (5-Finger Cybernetic Claws) ── */}
        <div
          ref={handLeftRef}
          className="absolute left-[36px] top-[215px] w-[44px] h-[52px] avatar-preserve-3d"
          style={{ transform: 'translateZ(18px)' }}
        >
          <svg
            viewBox="0 0 50 60"
            className="w-full h-full drop-shadow-[0_6px_14px_rgba(0,0,0,0.65)]"
          >
            {/* Thumb (Outer Left) */}
            <g transform="rotate(28, 11, 20)">
              <rect
                x="5.5"
                y="15"
                width="6.2"
                height="19"
                rx="3.1"
                fill="#14241c"
                stroke="#19362d"
                strokeWidth="1.5"
              />
              <line x1="6" y1="24.5" x2="11.2" y2="24.5" stroke="#254a3e" strokeWidth="1" />
              <circle cx="8.6" cy="30.5" r="2.1" fill="#ffffff" opacity="0.95" />
            </g>

            {/* 4 Lower Fingers */}
            {/* Index */}
            <rect
              x="12.5"
              y="18"
              width="5.8"
              height="26"
              rx="2.9"
              fill="#14241c"
              stroke="#19362d"
              strokeWidth="1.5"
            />
            <line x1="13" y1="31" x2="17.8" y2="31" stroke="#254a3e" strokeWidth="1" />
            <circle cx="15.4" cy="40.5" r="2" fill="#ffffff" opacity="0.95" />

            {/* Middle (Longest) */}
            <rect
              x="19.7"
              y="18"
              width="6.2"
              height="30"
              rx="3.1"
              fill="#14241c"
              stroke="#19362d"
              strokeWidth="1.5"
            />
            <line x1="20.2" y1="33" x2="25.4" y2="33" stroke="#254a3e" strokeWidth="1" />
            <circle cx="22.8" cy="44.5" r="2.2" fill="#ffffff" opacity="0.95" />

            {/* Ring */}
            <rect
              x="27.3"
              y="18"
              width="5.8"
              height="27"
              rx="2.9"
              fill="#14241c"
              stroke="#19362d"
              strokeWidth="1.5"
            />
            <line x1="27.8" y1="31" x2="32.6" y2="31" stroke="#254a3e" strokeWidth="1" />
            <circle cx="30.2" cy="41.5" r="2" fill="#ffffff" opacity="0.95" />

            {/* Pinky (Shortest) */}
            <rect
              x="34.5"
              y="18"
              width="5.2"
              height="22"
              rx="2.6"
              fill="#14241c"
              stroke="#19362d"
              strokeWidth="1.5"
            />
            <line x1="35" y1="29" x2="39.2" y2="29" stroke="#254a3e" strokeWidth="1" />
            <circle cx="37.1" cy="36.5" r="1.8" fill="#ffffff" opacity="0.95" />

            {/* Palm Base Chassis (Drawn over finger roots) */}
            <rect
              x="11"
              y="7"
              width="30"
              height="22"
              rx="11"
              fill="#13221b"
              stroke="#19362d"
              strokeWidth="2.2"
            />
            <ellipse
              cx="26"
              cy="17"
              rx="7"
              ry="5.5"
              fill="#0c1611"
              stroke="#19362d"
              strokeWidth="1"
            />
            <circle cx="26" cy="17" r="2" fill="#ffffff" opacity="0.35" />
          </svg>
        </div>

        <div
          ref={handRightRef}
          className="absolute left-[240px] top-[215px] w-[44px] h-[52px] avatar-preserve-3d"
          style={{ transform: 'translateZ(18px)' }}
        >
          <svg
            viewBox="0 0 50 60"
            className="w-full h-full drop-shadow-[0_6px_14px_rgba(0,0,0,0.65)]"
          >
            {/* Thumb (Outer Right) */}
            <g transform="rotate(-28, 39, 20)">
              <rect
                x="38.3"
                y="15"
                width="6.2"
                height="19"
                rx="3.1"
                fill="#14241c"
                stroke="#19362d"
                strokeWidth="1.5"
              />
              <line x1="38.8" y1="24.5" x2="44" y2="24.5" stroke="#254a3e" strokeWidth="1" />
              <circle cx="41.4" cy="30.5" r="2.1" fill="#ffffff" opacity="0.95" />
            </g>

            {/* Pinky (Left side) */}
            <rect
              x="10.3"
              y="18"
              width="5.2"
              height="22"
              rx="2.6"
              fill="#14241c"
              stroke="#19362d"
              strokeWidth="1.5"
            />
            <line x1="10.8" y1="29" x2="15" y2="29" stroke="#254a3e" strokeWidth="1" />
            <circle cx="12.9" cy="36.5" r="1.8" fill="#ffffff" opacity="0.95" />

            {/* Ring */}
            <rect
              x="16.9"
              y="18"
              width="5.8"
              height="27"
              rx="2.9"
              fill="#14241c"
              stroke="#19362d"
              strokeWidth="1.5"
            />
            <line x1="17.4" y1="31" x2="22.2" y2="31" stroke="#254a3e" strokeWidth="1" />
            <circle cx="19.8" cy="41.5" r="2" fill="#ffffff" opacity="0.95" />

            {/* Middle */}
            <rect
              x="24.1"
              y="18"
              width="6.2"
              height="30"
              rx="3.1"
              fill="#14241c"
              stroke="#19362d"
              strokeWidth="1.5"
            />
            <line x1="24.6" y1="33" x2="29.8" y2="33" stroke="#254a3e" strokeWidth="1" />
            <circle cx="27.2" cy="44.5" r="2.2" fill="#ffffff" opacity="0.95" />

            {/* Index */}
            <rect
              x="31.7"
              y="18"
              width="5.8"
              height="26"
              rx="2.9"
              fill="#14241c"
              stroke="#19362d"
              strokeWidth="1.5"
            />
            <line x1="32.2" y1="31" x2="37" y2="31" stroke="#254a3e" strokeWidth="1" />
            <circle cx="34.6" cy="40.5" r="2" fill="#ffffff" opacity="0.95" />

            {/* Palm Base Chassis */}
            <rect
              x="9"
              y="7"
              width="30"
              height="22"
              rx="11"
              fill="#13221b"
              stroke="#19362d"
              strokeWidth="2.2"
            />
            <ellipse
              cx="24"
              cy="17"
              rx="7"
              ry="5.5"
              fill="#0c1611"
              stroke="#19362d"
              strokeWidth="1"
            />
            <circle cx="24" cy="17" r="2" fill="#ffffff" opacity="0.35" />
          </svg>
        </div>

        {/* ── 4. THRUSTER PARTICLES & SHADOW AT BOTTOM ── */}
        <div
          ref={thrusterRef}
          className="absolute left-[118px] top-[305px] w-[84px] h-[22px] rounded-full bg-white/25 blur-[10px] pointer-events-none"
          style={{ transform: 'translateZ(-35px)' }}
        />
        <div
          ref={groundShadowRef}
          className="absolute left-[90px] top-[360px] w-[140px] h-[26px] rounded-full bg-black/75 blur-[8px] pointer-events-none"
          style={{ transform: 'translateZ(-60px) rotateX(75deg)' }}
        />
      </div>
    </div>
  )
}

export default memo(Avatar)
