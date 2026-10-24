import { Navigate, useParams } from 'react-router-dom'
import { getAddon } from '../api/addonRegistry'
import AddonDetail from './AddonDetail'
import GoogleWorkspace from './GoogleWorkspace'
import TelegramAddonDetail from './TelegramAddonDetail'

export default function AddonDetailRoute() {
  const { addonId } = useParams()
  const addon = getAddon(addonId)
  if (addon?.detailRenderer === 'google-workspace') {
    return (
      <AddonDetail addon={addon}>
        <GoogleWorkspace />
      </AddonDetail>
    )
  }
  if (addon?.detailRenderer === 'telegram') {
    return (
      <AddonDetail addon={addon}>
        <TelegramAddonDetail />
      </AddonDetail>
    )
  }
  return <Navigate to="/addons" replace />
}
