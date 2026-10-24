import PropTypes from 'prop-types'

export function ConfigField({ id, label, hint, children }) {
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="block text-sm font-medium text-white/85">
        {label}
      </label>
      {children}
      {hint && (
        <p id={`${id}-hint`} className="text-xs leading-relaxed text-white/50">
          {hint}
        </p>
      )}
    </div>
  )
}
ConfigField.propTypes = {
  id: PropTypes.string.isRequired,
  label: PropTypes.string.isRequired,
  hint: PropTypes.node,
  children: PropTypes.node
}

export function ConfigToggle({ id, label, description, checked, onChange }) {
  return (
    <label
      htmlFor={id}
      className="flex cursor-pointer items-start justify-between gap-6 border-b border-white/10 py-5 first:pt-0 last:border-0 last:pb-0"
    >
      <span>
        <span className="block text-sm font-medium text-white/85">{label}</span>
        <span
          id={`${id}-hint`}
          className="mt-2 block max-w-lg text-xs leading-relaxed text-white/50"
        >
          {description}
        </span>
      </span>
      <input
        id={id}
        type="checkbox"
        aria-describedby={`${id}-hint`}
        className="toggle toggle-primary toggle-sm mt-1 shrink-0"
        checked={checked}
        onChange={onChange}
      />
    </label>
  )
}
ConfigToggle.propTypes = {
  id: PropTypes.string.isRequired,
  label: PropTypes.string.isRequired,
  description: PropTypes.string.isRequired,
  checked: PropTypes.bool.isRequired,
  onChange: PropTypes.func.isRequired
}
