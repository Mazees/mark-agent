import { useEffect, useState } from 'react'
import { mcpRequest } from '../../api/mcp'

let labels = {}
let pending

function loadLabels() {
  if (!pending) {
    pending = mcpRequest('/tool-labels')
      .then((result) => {
        labels = result.data || {}
        return labels
      })
      .finally(() => {
        pending = null
      })
  }
  return pending
}

export function McpToolName({ name }) {
  const [label, setLabel] = useState(() => ({ name, value: labels[name] }))
  useEffect(() => {
    let active = true
    if (name?.startsWith('mcp_')) {
      loadLabels()
        .then((items) => {
          if (active) setLabel({ name, value: items[name] })
        })
        .catch(() => {})
    }
    return () => {
      active = false
    }
  }, [name])
  return name?.startsWith('mcp_')
    ? (label.name === name && label.value) || labels[name] || 'Tool MCP'
    : name
}
