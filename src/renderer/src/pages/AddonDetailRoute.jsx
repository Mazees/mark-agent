import { Navigate, useParams } from 'react-router-dom'
import { getAddon } from '../api/addonRegistry'
import GoogleWorkspace from './GoogleWorkspace'
import TelegramAddonDetail from './TelegramAddonDetail'
import ChromeBridgeAddonDetail from './ChromeBridgeAddonDetail'

export default function AddonDetailRoute() {
  const { addonId } = useParams()
  const addon = getAddon(addonId)
  if (addon?.detailRenderer === 'chrome-bridge') {
    return <ChromeBridgeAddonDetail />
  }
  if (addon?.detailRenderer === 'google-workspace') {
    return <GoogleWorkspace />
  }
  if (addon?.detailRenderer === 'telegram') {
    return <TelegramAddonDetail />
  }
  return <Navigate to="/addons" replace />
}
