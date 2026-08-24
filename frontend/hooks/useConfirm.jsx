import React, { useState, useCallback, useRef } from 'react'
import ConfirmModal from '../components/core/ConfirmModal'

export const useConfirm = () => {
  const [modalConfig, setModalConfig] = useState({
    isOpen: false,
    title: '',
    message: '',
    isError: false,
    confirmText: 'Ya',
    cancelText: 'Batal',
    hideCancel: false
  })
  const promiseRef = useRef(null)

  const confirm = useCallback((config) => {
    return new Promise((resolve) => {
      promiseRef.current = resolve
      setModalConfig({
        isOpen: true,
        title: config.title || 'Konfirmasi',
        message: config.message || config.text || '',
        isError: config.isError || config.icon === 'error' || config.icon === 'warning' || false,
        confirmText: config.confirmText || config.confirmButtonText || 'Ya',
        cancelText: config.cancelText || config.cancelButtonText || 'Batal',
        hideCancel:
          config.hideCancel || (!config.showCancelButton && config.showCancelButton !== undefined)
            ? true
            : false
      })
    })
  }, [])

  const handleConfirm = useCallback(() => {
    setModalConfig((prev) => ({ ...prev, isOpen: false }))
    if (promiseRef.current) {
      promiseRef.current({ isConfirmed: true })
      promiseRef.current = null
    }
  }, [])

  const handleCancel = useCallback(() => {
    setModalConfig((prev) => ({ ...prev, isOpen: false }))
    if (promiseRef.current) {
      promiseRef.current({ isConfirmed: false })
      promiseRef.current = null
    }
  }, [])

  const ModalComponent = useCallback(
    () => (
      <ConfirmModal
        isOpen={modalConfig.isOpen}
        title={modalConfig.title}
        message={modalConfig.message}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
        confirmText={modalConfig.confirmText}
        cancelText={modalConfig.cancelText}
        isError={modalConfig.isError}
        hideCancel={modalConfig.hideCancel}
      />
    ),
    [modalConfig, handleConfirm, handleCancel]
  )

  return { confirm, ModalComponent }
}
