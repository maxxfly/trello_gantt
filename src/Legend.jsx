import React from "react";
import { STEP_STATE_META, LIST_PALETTE } from "./ganttModel.js";

/**
 * Légende à deux niveaux :
 *  1. Les étapes globales (listes/colonnes Trello) -> couleur de la ligne
 *  2. Le statut des sous-étapes (items de checklist) -> couleur des segments de barre
 */
export default function Legend({ lists }) {
  return (
    <div className="legend">
      <div className="legend__group">
        <h3>Listes (étape de la tâche)</h3>
        <ul>
          {lists.map((l, i) => (
            <li key={l.id}>
              <span
                className="legend__swatch"
                style={{ background: LIST_PALETTE[i % LIST_PALETTE.length] }}
              />
              {l.name}
            </li>
          ))}
        </ul>
      </div>
      <div className="legend__group">
        <h3>Sous-étapes (checklist)</h3>
        <ul>
          {Object.entries(STEP_STATE_META).map(([key, meta]) => (
            <li key={key}>
              <span
                className="legend__swatch"
                style={{ background: meta.color }}
              />
              {meta.label}
            </li>
          ))}
        </ul>
      </div>
      <div className="legend__group">
        <h3>Repères</h3>
        <ul>
          <li>
            <span className="legend__swatch legend__swatch--line" />
            Ligne du jour actuel
          </li>
          <li>
            <span className="legend__swatch legend__swatch--diamond" />
            Échéance (due date)
          </li>
        </ul>
      </div>
    </div>
  );
}
