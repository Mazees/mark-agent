/* eslint-disable react/prop-types */
import { API_BASE } from '../../api/web-bridge'
import { useChat } from '../../contexts/ChatContext'
import { resolveChatLink } from '../../utils/chatLinks'

export function ChatLink({ href, children, title, className }) {
  const { currentActiveSessionId } = useChat()
  const destination = resolveChatLink(href, currentActiveSessionId, API_BASE)
  return (
    <a
      title={title}
      className={className}
      href={destination || undefined}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(event) => {
        if (!destination || destination.startsWith('#')) event.preventDefault()
      }}
    >
      {children}
    </a>
  )
}
