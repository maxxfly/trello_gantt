import React, { useEffect, useMemo, useRef, useState } from "react";

/**
 * Liste déroulante multi-sélection de tags (avec recherche et pastilles
 * couleur), remplace les chips inline qui deviennent inutilisables quand il
 * y a beaucoup d'étiquettes. Composant autonome (pas de dépendance externe).
 *
 * @param {Array<{id,name,color}>} labels  tous les tags du board
 * @param {Set<string>} selected           IDs sélectionnés (vide = pas de filtre)
 * @param {(id:string)=>void} onToggle     bascule un tag
 * @param ()=>void onClear                 vide la sélection
 */
export default function TagSelect({ labels, selected, onToggle, onClear }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef(null);
  const inputRef = useRef(null);

  // Ferme au clic hors du composant / Échap
  useEffect(() => {
    if (!open) return undefined;
    const onDocDown = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target))
        setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDocDown);
    document.addEventListener("keydown", onKey);
    inputRef.current?.focus();
    return () => {
      document.removeEventListener("mousedown", onDocDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const norm = (s) =>
    (s || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  const filtered = useMemo(() => {
    const q = norm(query.trim());
    if (!q) return labels;
    return labels.filter((l) => norm(l.name).includes(q));
  }, [labels, query]);

  if (!labels.length) return null;

  const selectedNames = labels
    .filter((l) => selected.has(l.id))
    .map((l) => l.name || "(sans nom)");

  return (
    <div className="tagselect" ref={rootRef}>
      <button
        type="button"
        className={`tagselect__trigger${open ? " tagselect__trigger--open" : ""}`}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        title="Filtrer par tag(s) — logique OU (au moins un des tags sélectionnés)"
      >
        <span className="tagselect__icon">🏷️</span>
        <span className="tagselect__value">
          {selected.size === 0
            ? "Tous les tags"
            : selected.size === 1
              ? selectedNames[0]
              : `${selected.size} tags sélectionnés`}
        </span>
        {selected.size > 0 && (
          <span
            className="tagselect__clear"
            role="button"
            tabIndex={0}
            title="Effacer le filtre sur les tags"
            onClick={(e) => {
              e.stopPropagation();
              onClear();
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.stopPropagation();
                onClear();
              }
            }}
          >
            ✕
          </span>
        )}
        <span className="tagselect__caret">▾</span>
      </button>

      {open && (
        <div className="tagselect__panel" role="listbox">
          <input
            ref={inputRef}
            type="search"
            className="tagselect__search"
            placeholder="Filtrer les tags…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            spellCheck={false}
          />
          <ul className="tagselect__list">
            {filtered.length === 0 && (
              <li className="tagselect__empty">Aucun tag ne correspond.</li>
            )}
            {filtered.map((l) => {
              const checked = selected.has(l.id);
              return (
                <li key={l.id}>
                  <label
                    className={`tagselect__opt${checked ? " tagselect__opt--checked" : ""}`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => onToggle(l.id)}
                    />
                    <span
                      className="tagselect__swatch"
                      style={{ background: l.color }}
                    />
                    <span className="tagselect__name">
                      {l.name || "(sans nom)"}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
