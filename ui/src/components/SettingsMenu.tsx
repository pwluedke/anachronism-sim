// Header settings: viewer preferences that change what's shown, never the game.
import type { Settings } from "../settings";

export function SettingsMenu({ settings, onChange }: { settings: Settings; onChange: (patch: Partial<Settings>) => void }) {
  return (
    <details className="settings">
      <summary className="btn">Settings</summary>
      <div className="settings-panel parchment">
        <label className="setting">
          <input
            type="checkbox"
            checked={settings.showFaceDownAbilities}
            onChange={(e) => onChange({ showFaceDownAbilities: e.target.checked })}
          />
          <span>
            <strong>Show face-down card abilities</strong>
            <span className="muted">
              {" "}
              — learning mode: list what your unrevealed cards will do. Turn off to see only what's revealed. The computer's
              face-down cards always stay hidden.
            </span>
          </span>
        </label>
      </div>
    </details>
  );
}
