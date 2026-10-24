import { ConfigField, ConfigToggle } from './ConfigFields'
import { useEffect, useRef, useState } from 'react'
import PropTypes from 'prop-types'
import { Camera, RefreshCw } from 'lucide-react'
import { configProps, controlClass } from './configStyles'

export const ConfigCameraPreview = ({ deviceId, enabled, onDevices }) => {
  const videoRef = useRef(null)
  const [error, setError] = useState('')
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (!enabled) return
    let stream
    let mounted = true
    const start = async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error()
        stream = await navigator.mediaDevices.getUserMedia({
          video: deviceId && deviceId !== 'default' ? { deviceId: { exact: deviceId } } : true
        })
        if (!mounted) {
          stream.getTracks().forEach((track) => track.stop())
          return
        }
        videoRef.current.srcObject = stream
        await videoRef.current.play()
        if (!mounted) return
        setReady(true)
        const devices = await navigator.mediaDevices.enumerateDevices()
        if (mounted) onDevices?.(devices.filter((device) => device.kind === 'videoinput'))
      } catch {
        stream?.getTracks().forEach((track) => track.stop())
        if (mounted)
          setError(
            'Kamera belum dapat diakses. Periksa izin browser dan pastikan kamera tidak sedang digunakan aplikasi lain.'
          )
      }
    }
    start()
    return () => {
      mounted = false
      stream?.getTracks().forEach((track) => track.stop())
    }
  }, [deviceId, enabled, onDevices])

  if (!enabled) return null
  return (
    <div className="overflow-hidden rounded-xl border border-white/10">
      <div className="relative aspect-video bg-black/50">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="h-full w-full object-contain"
          aria-label="Pratinjau kamera"
        />
        {!ready && !error && (
          <p
            role="status"
            className="absolute inset-0 flex items-center justify-center text-xs text-white/50"
          >
            Menghubungkan kamera…
          </p>
        )}
      </div>
      <p
        role={error ? 'alert' : 'status'}
        className={`px-4 py-3 text-xs leading-relaxed ${error ? 'text-error' : 'text-white/50'}`}
      >
        {error ||
          (ready
            ? 'Pratinjau aktif. Kamera berhenti saat pratinjau ditutup atau Anda berpindah bagian.'
            : 'Menunggu kamera…')}
      </p>
    </div>
  )
}
ConfigCameraPreview.propTypes = {
  deviceId: PropTypes.string,
  enabled: PropTypes.bool,
  onDevices: PropTypes.func
}

export const CameraSection = ({ config, setConfig }) => {
  const [devices, setDevices] = useState([])
  const [preview, setPreview] = useState(false)
  const [error, setError] = useState('')
  const mounted = useRef(false)
  const enabled = config.cameraEnabled !== false
  const scan = () => {
    const request = navigator.mediaDevices?.enumerateDevices?.() || Promise.reject()
    return request
      .then((list) => {
        if (mounted.current) {
          setDevices(list.filter((device) => device.kind === 'videoinput'))
          setError('')
        }
      })
      .catch(() => {
        if (mounted.current)
          setError('Daftar kamera belum dapat dibaca. Buka pratinjau untuk memberikan izin kamera.')
      })
  }
  useEffect(() => {
    mounted.current = true
    scan()
    return () => {
      mounted.current = false
    }
  }, [])

  return (
    <div className="space-y-6">
      <ConfigToggle
        id="camera-enabled"
        label="Izinkan penggunaan kamera"
        description="Mark dapat menggunakan kamera saat Anda memintanya. Mengaktifkan pengaturan ini tidak langsung menyalakan kamera."
        checked={enabled}
        onChange={(event) => {
          setConfig((previous) => ({ ...previous, cameraEnabled: event.target.checked }))
          setPreview(false)
        }}
      />
      {enabled && (
        <>
          <ConfigField
            id="camera-device"
            label="Perangkat kamera"
            hint="Jika nama perangkat belum muncul, buka pratinjau dan berikan izin akses melalui browser."
          >
            <select
              id="camera-device"
              aria-describedby="camera-device-hint"
              className={`select ${controlClass}`}
              value={config.cameraDeviceId || 'default'}
              onChange={(event) =>
                setConfig((previous) => ({ ...previous, cameraDeviceId: event.target.value }))
              }
            >
              <option value="default">Kamera utama sistem</option>
              {config.cameraDeviceId &&
                config.cameraDeviceId !== 'default' &&
                !devices.some((device) => device.deviceId === config.cameraDeviceId) && (
                  <option value={config.cameraDeviceId}>Kamera tersimpan (belum terdeteksi)</option>
                )}
              {devices
                .filter((device) => device.deviceId)
                .map((device, index) => (
                  <option key={device.deviceId} value={device.deviceId}>
                    {device.label || `Kamera ${index + 1}`}
                  </option>
                ))}
            </select>
          </ConfigField>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setPreview((value) => !value)}
              className="btn btn-ghost rounded-full border-white/15 text-sm"
            >
              <Camera size={16} />
              {preview ? 'Hentikan pratinjau' : 'Mulai pratinjau'}
            </button>
            <button
              type="button"
              onClick={scan}
              className="btn btn-ghost rounded-full text-sm text-white/60"
            >
              <RefreshCw size={15} />
              Perbarui daftar
            </button>
          </div>
          {error && (
            <p role="alert" className="text-xs leading-relaxed text-error">
              {error}
            </p>
          )}
          {preview && (
            <ConfigCameraPreview
              key={config.cameraDeviceId}
              deviceId={config.cameraDeviceId}
              enabled={preview}
              onDevices={setDevices}
            />
          )}
        </>
      )}
    </div>
  )
}
CameraSection.propTypes = configProps
