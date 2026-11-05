import { canonicalTarget, digest } from './approval-policy.js'

const scopes = new WeakMap()

export async function withApprovedFileTargets(config, tool, args, targets, action) {
  scopes.set(config, {
    tool,
    argsHash: digest(args),
    root: canonicalTarget(config.workspaceRoot),
    targets: new Set(targets)
  })
  try {
    return await action()
  } finally {
    scopes.delete(config)
  }
}

export function isApprovedFileTarget(config, tool, args, root, target) {
  const scope = scopes.get(config)
  return Boolean(
    scope &&
    scope.tool === tool &&
    scope.argsHash === digest(args) &&
    scope.root === canonicalTarget(root) &&
    scope.targets.has(canonicalTarget(target))
  )
}
