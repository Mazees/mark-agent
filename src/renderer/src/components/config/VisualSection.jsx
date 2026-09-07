export const VisualSection = ({ config, setConfig }) => {
  return (
    <section className="space-y-5 p-2 -mx-2 rounded-lg">
      <h2 className="text-base font-bold uppercase tracking-wider opacity-70">
        Visual & Background Cosmos
      </h2>

      <div className="space-y-3">
        <div className="flex justify-between items-center">
          <div>
            <p className="text-sm font-semibold">Transparansi Lapisan Layar (Background Overlay)</p>
          </div>
          <span className="text-xs font-mono font-bold bg-primary/20 text-primary px-2.5 py-1 rounded-lg border border-primary/30">
            {config.bgOverlayOpacity ?? 65}% Kegelapan
          </span>
        </div>

        <input
          type="range"
          min="0"
          max="100"
          step="5"
          value={config.bgOverlayOpacity ?? 65}
          onChange={(e) => {
            const val = Number(e.target.value)
            setConfig((prev) => {
              const updated = { ...prev, bgOverlayOpacity: val }
              window.dispatchEvent(new CustomEvent('config-updated', { detail: updated }))
              return updated
            })
          }}
          className="range range-primary range-xs w-full"
        />
      </div>
    </section>
  )
}
