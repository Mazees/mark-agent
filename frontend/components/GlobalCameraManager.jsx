import { useState, useEffect, useRef } from 'react'
import { useChat } from '../contexts/ChatContext'
import { CameraPreview } from './camera/CameraPreview'

export const GlobalCameraManager = () => {
  const { requestCameraCaptureRef } = useChat()
  const [isCameraOpen, setIsCameraOpen] = useState(false)
  const [cameraIsAutonomous, setCameraIsAutonomous] = useState(false)
  const [cameraDeviceId, setCameraDeviceId] = useState(null)
  const cameraResolverRef = useRef(null)

  useEffect(() => {
    if (requestCameraCaptureRef) {
      console.log('[GlobalCameraManager] Setting requestCameraCaptureRef.current callback')
      requestCameraCaptureRef.current = ({ isAutonomous, deviceId }) => {
        console.log(
          '[GlobalCameraManager] Camera capture requested! isAutonomous:',
          isAutonomous,
          'deviceId:',
          deviceId
        )
        return new Promise((resolve) => {
          cameraResolverRef.current = resolve
          setCameraIsAutonomous(isAutonomous || false)
          setCameraDeviceId(deviceId || null)
          setIsCameraOpen(true)
        })
      }

      return () => {
        requestCameraCaptureRef.current = null
        if (cameraResolverRef.current) {
          cameraResolverRef.current(null)
          cameraResolverRef.current = null
        }
      }
    } else {
      console.warn('[GlobalCameraManager] requestCameraCaptureRef is undefined/null from context!')
    }
  }, [requestCameraCaptureRef])

  const handleCameraCapture = (base64) => {
    if (cameraResolverRef.current) {
      cameraResolverRef.current(base64)
      cameraResolverRef.current = null
    }
    setIsCameraOpen(false)
  }

  const handleCameraClose = () => {
    if (cameraResolverRef.current) {
      cameraResolverRef.current(null)
      cameraResolverRef.current = null
    }
    setIsCameraOpen(false)
  }

  return (
    <CameraPreview
      isOpen={isCameraOpen}
      onClose={handleCameraClose}
      onCapture={handleCameraCapture}
      isAutonomous={cameraIsAutonomous}
      deviceId={cameraDeviceId}
    />
  )
}
