import React from "react";
import { LIST_PALETTE } from "./ganttModel.js";

/**
 * Légende :
 *  1. Les étapes = colonnes Trello -> couleur des segments de la barre
 *  2. Le sens des segments (périodes entre changements de colonne)
 */
export default function Legend({ lists }) {
  return (
    <div className="legend">
      <div className="legend__group">
        <h3>Colonnes Trello = couleur des segments</h3>
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
        <h3>Marques sur les barres</h3>
        <ul>
          <li>
            <span className="legend__swatch legend__swatch--current" />
            Colonne actuelle (tâche en cours)
          </li>
          <li>
            <span className="legend__swatch legend__swatch--revisit" />
            Retour dans une colonne déjà quittée
          </li>
          <li>
            <span className="legend__swatch legend__swatch--back">◀</span>
            Retour en arrière dans le flux (option)
          </li>
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
          <li>
            <span className="legend__swatch legend__swatch--diamond-past" />
            Ancienne échéance (repoussée)
          </li>
        </ul>
      </div>
    </div>
  );
}
