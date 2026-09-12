import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AvatarStack } from "./Avatars.jsx";

const DAY_MS = 24 * 60 * 60 * 1000;
const SIDE_W = 320; // largeur de la colonne « Tâche » (doit matcher .gantt__row-side)
const ZOOM_MIN = 8;
const ZOOM_MAX = 80;

function dayDiff(a, b) {
  return (b.getTime() - a.getTime()) / DAY_MS;
}

/** Jours du mois -> graduations hebdomadaires (lundis) pour l'en-tête. */
function buildWeekTicks(min, max) {
  const ticks = [];
  const d = new Date(min);
  // Premier lundi >= min
  const dow = (d.getDay() + 6) % 7; // 0 = lundi
  if (dow > 0) d.setDate(d.getDate() + (7 - dow));
  d.setHours(0, 0, 0, 0);
  while (d <= max) {
    ticks.push(new Date(d));
    d.setDate(d.getDate() + 7);
  }
  return ticks;
}

function buildMonthTicks(min, max) {
  const ticks = [];
  const d = new Date(min.getFullYear(), min.getMonth(), 1);
  while (d <= max) {
    if (d >= min) ticks.push(new Date(d));
    d.setMonth(d.getMonth() + 1);
  }
  return ticks;
}

const fmtMonth = new Intl.DateTimeFormat("fr-FR", {
  month: "long",
  year: "numeric",
});
const fmtDay = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "short",
});
const fmtFull = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

export default function GanttChart({ model }) {
  const { rows, min, max, title } = model;
  const [pxPerDay, setPxPerDay] = useState(28);
  const pxPerDayRef = useRef(pxPerDay);
  const zoomAnchorRef = useRef(null); // { days, trackX } : date à garder sous le curseur
  const [showBack, setShowBack] = useState(
    () => localStorage.getItem("gantt-trello-show-back") !== "0",
  );
  const toggleShowBack = () => {
    setShowBack((v) => {
      localStorage.setItem("gantt-trello-show-back", v ? "0" : "1");
      return !v;
    });
  };
  const [compact, setCompact] = useState(
    () => localStorage.getItem("gantt-trello-density") === "compact",
  );
  const toggleDensity = () => {
    setCompact((v) => {
      localStorage.setItem("gantt-trello-density", v ? "normal" : "compact");
      return !v;
    });
  };
  const scrollRef = useRef(null);
  const mapRef = useRef(null);
  const mapDragRef = useRef(null);

  // ---- Mini-carte : fenêtre du viewport + glisser pour naviguer ----------
  const [view, setView] = useState({ left: 0, width: 1 });
  const syncView = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setView({
      left: el.scrollLeft,
      width: Math.max(1, el.clientWidth - SIDE_W),
    });
  }, []);

  /**
   * Zoom à la molette / pinch : Ctrl (⌘ sur Mac) + molette, ou pincement du
   * pavé tactile (qui émet wheel + ctrlKey). La molette seule reste un
   * défilement normal. L'échelle est ancrée sur la date sous le curseur.
   */
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return undefined;
    const onWheel = (e) => {
      if (!(e.ctrlKey || e.metaKey)) return; // défilement normal
      e.preventDefault(); // évite le zoom de la page (Chrome/Safari)
      const rect = el.getBoundingClientRect();
      const trackX = e.clientX - rect.left - SIDE_W; // px visibles dans la timeline
      const cur = pxPerDayRef.current;
      // Facteur de zoom : pincements (deltaY fins) doux, molette crantée plus franche.
      const step = Math.abs(e.deltaY) > 50 ? 0.006 : 0.012;
      const factor = Math.exp(-e.deltaY * step);
      const next = Math.min(
        ZOOM_MAX,
        Math.max(ZOOM_MIN, Math.round(cur * factor)),
      );
      if (next === cur) return;
      if (trackX >= 0) {
        // Date (en jours depuis min) sous le curseur -> doit y rester après zoom.
        zoomAnchorRef.current = {
          days: (el.scrollLeft + trackX) / cur,
          trackX,
        };
      }
      pxPerDayRef.current = next;
      setPxPerDay(next);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  // Après le re-render (nouvelle largeur), recale le scroll pour garder
  // l'ancrage sous le curseur.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    const anchor = zoomAnchorRef.current;
    if (el && anchor) {
      el.scrollLeft = anchor.days * pxPerDay - anchor.trackX;
      zoomAnchorRef.current = null;
    }
    syncView();
  }, [pxPerDay, syncView]);

  const totalDays = Math.max(1, dayDiff(min, max));
  const totalWidth = totalDays * pxPerDay;
  const x = (date) => dayDiff(min, date) * pxPerDay;

  const weekTicks = useMemo(() => buildWeekTicks(min, max), [min, max]);
  const monthTicks = useMemo(() => buildMonthTicks(min, max), [min, max]);
  const todayX = x(new Date(new Date().setHours(0, 0, 0, 0)));
  const todayVisible = todayX >= 0 && todayX <= totalWidth;

  // Week-ends (sam.+dim.) grisés : une bande de 7 jours (2 jours grisés puis
  // 5 transparents) répétée en fond de piste, calée sur un samedi <= min.
  const weekendStyle = useMemo(() => {
    const d = new Date(min);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - 7);
    while (d.getDay() !== 6) d.setDate(d.getDate() + 1);
    const satX = dayDiff(min, d) * pxPerDay;
    return {
      backgroundImage: `linear-gradient(90deg, rgba(100,116,139,0.12) 0 ${2 * pxPerDay}px, transparent ${2 * pxPerDay}px ${7 * pxPerDay}px)`,
      backgroundSize: `${7 * pxPerDay}px 100%`,
      backgroundPosition: `${satX}px 0`,
      backgroundRepeat: "repeat",
    };
  }, [min, pxPerDay]);

  // ---- Mini-carte : écoute du scroll/resize ------------------------------
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return undefined;
    const h = () => syncView();
    el.addEventListener("scroll", h, { passive: true });
    window.addEventListener("resize", h);
    syncView();
    return () => {
      el.removeEventListener("scroll", h);
      window.removeEventListener("resize", h);
    };
  }, [syncView, rows.length]);

  const onMapDown = (e) => {
    const el = scrollRef.current;
    const map = mapRef.current;
    if (!el || !map || totalWidth <= 0) return;
    const rect = map.getBoundingClientRect();
    const toTl = (clientX) => ((clientX - rect.left) / rect.width) * totalWidth;
    const click = toTl(e.clientX);
    const inside = click >= view.left && click <= view.left + view.width;
    const offset = inside ? click - view.left : view.width / 2;
    const move = (clientX2) => {
      el.scrollLeft = Math.max(0, toTl(clientX2) - offset);
    };
    if (!inside) move(e.clientX);
    mapDragRef.current = move;
    map.setPointerCapture(e.pointerId);
  };
  const onMapMove = (e) => {
    if (mapDragRef.current) mapDragRef.current(e.clientX);
  };
  const onMapUp = () => {
    mapDragRef.current = null;
  };

  return (
    <div className={`gantt${compact ? " gantt--compact" : ""}`}>
      <div className="gantt__toolbar">
        <h2 className="gantt__title">{title}</h2>
        <label
          className="gantt__toggle"
          title="Marquer les retours en arrière dans le flux (◀ sur le segment concerné)"
        >
          <input type="checkbox" checked={showBack} onChange={toggleShowBack} />
          ◀ Retours en arrière
        </label>
        <button
          type="button"
          className="gantt__iconbtn"
          onClick={toggleDensity}
          title={
            compact ? "Passer en lignes confort" : "Passer en lignes compactes"
          }
        >
          {compact ? "↕️ Confort" : "⇲ Compact"}
        </button>
        <div
          className="gantt__zoom"
          title="Molette + Ctrl (⌘) ou pincement du pavé tactile pour zoomer sur la timeline"
        >
          <span>Zoom</span>
          <input
            type="range"
            min={ZOOM_MIN}
            max={ZOOM_MAX}
            value={pxPerDay}
            onChange={(e) => {
              pxPerDayRef.current = Number(e.target.value);
              setPxPerDay(Number(e.target.value));
            }}
          />
        </div>
      </div>

      {/* Mini-carte : vue d'ensemble + navigation par glissement */}
      <div
        className="gantt__minimap"
        ref={mapRef}
        onPointerDown={onMapDown}
        onPointerMove={onMapMove}
        onPointerUp={onMapUp}
        onPointerCancel={onMapUp}
        title="Vue d'ensemble — cliquer ou glisser pour naviguer"
      >
        {(() => {
          // Espacement vertical des mini-lignes : on compacte (et on plafonne le
          // nombre de lignes affichées) quand il y a beaucoup de tâches.
          const usable = 50; // hauteur utile en px
          const step = Math.max(
            2,
            Math.floor(usable / Math.max(1, Math.min(rows.length, 14))),
          );
          const maxLines = Math.floor(usable / step);
          return rows.slice(0, maxLines).map((r, i) => (
            <div
              key={r.id}
              className="gantt__mini-row"
              style={{ top: 2 + i * step }}
            >
              <span
                className="gantt__mini-bar"
                style={{
                  left: `${(x(r.start) / totalWidth) * 100}%`,
                  width: `${Math.max(0.4, ((x(r.end) - x(r.start)) / totalWidth) * 100)}%`,
                  background: r.color,
                  opacity: r.closed ? 0.4 : 0.9,
                }}
              />
            </div>
          ));
        })()}
        <div
          className="gantt__mini-viewport"
          style={{
            left: `${(view.left / totalWidth) * 100}%`,
            width: `${Math.min(100, (view.width / totalWidth) * 100)}%`,
          }}
        />
      </div>

      <div className="gantt__scroll" ref={scrollRef}>
        <div className="gantt__inner" style={{ width: SIDE_W + totalWidth }}>
          {/* En-tête timeline */}
          <div className="gantt__header">
            <div className="gantt__header-side">Tâche</div>
            <div
              className="gantt__header-track"
              style={{ width: totalWidth, ...weekendStyle }}
            >
              <div className="gantt__months">
                {monthTicks.map((m, i) => {
                  const next = monthTicks[i + 1] || max;
                  const w = dayDiff(m, next) * pxPerDay;
                  return (
                    <div
                      key={m.toISOString()}
                      className="gantt__month"
                      style={{ width: w }}
                    >
                      {fmtMonth.format(m)}
                    </div>
                  );
                })}
              </div>
              <div className="gantt__weeks">
                {weekTicks.map((wk) => (
                  <div
                    key={wk.toISOString()}
                    className="gantt__week"
                    style={{ left: x(wk) }}
                    title={`Semaine du ${fmtDay.format(wk)}`}
                  >
                    {fmtDay.format(wk)}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Lignes de tâches */}
          {rows.length === 0 && (
            <div className="gantt__empty">Aucune tâche dans ce tableau.</div>
          )}
          {rows.map((row) => {
            const left = x(row.start);
            const width = Math.max(6, x(row.end) - left);
            const barMs = Math.max(1, row.end - row.start);
            const segments =
              row.steps.length > 0
                ? row.steps
                : [
                    {
                      listName: row.listName,
                      color: row.color,
                      from: row.start,
                      to: row.end,
                      state: "done",
                    },
                  ];
            return (
              <div
                key={row.id}
                className={`gantt__row${row.closed ? " gantt__row--closed" : ""}`}
              >
                <div className="gantt__row-side" title={row.name}>
                  <span
                    className="gantt__row-dot"
                    style={{ background: row.color }}
                  />
                  <span className="gantt__row-titles">
                    {row.url ? (
                      <a
                        className="gantt__row-name gantt__row-link"
                        href={row.url}
                        target="_blank"
                        rel="noreferrer"
                        title={`Ouvrir la carte dans Trello : ${row.name}`}
                      >
                        {row.name}
                      </a>
                    ) : (
                      <span className="gantt__row-name">{row.name}</span>
                    )}
                    {row.labels?.length > 0 && (
                      <span className="gantt__labels">
                        {row.labels.map((l) => (
                          <span
                            key={l.id}
                            className="gantt__label"
                            style={{ background: l.color }}
                            title={`Tag : ${l.name || "(sans nom)"}`}
                          >
                            {l.name}
                          </span>
                        ))}
                      </span>
                    )}
                  </span>
                  <AvatarStack members={row.members} size={22} max={3} />
                </div>
                <div
                  className="gantt__row-track"
                  style={{ width: totalWidth, ...weekendStyle }}
                >
                  {weekTicks.map((wk) => (
                    <div
                      key={wk.toISOString()}
                      className="gantt__gridline"
                      style={{ left: x(wk) }}
                    />
                  ))}
                  {todayVisible && (
                    <div className="gantt__today" style={{ left: todayX }} />
                  )}
                  <div
                    className={`gantt__bar${row.steps.length === 0 ? " gantt__bar--plain" : ""}${!row.done ? " gantt__bar--ongoing" : ""}`}
                    style={{
                      left,
                      width,
                      opacity: row.closed ? 0.45 : 1,
                    }}
                    title={
                      !row.done
                        ? "Tâche en cours : la barre se prolonge jusqu'à aujourd'hui"
                        : undefined
                    }
                  >
                    {segments.map((s, i) => {
                      const segWidth = ((s.to - s.from) / barMs) * 100;
                      const pct = Math.max(0.5, Math.min(100, segWidth));
                      return (
                        <div
                          key={i}
                          className={`gantt__segment${s.state === "current" ? " gantt__segment--current" : ""}${s.state === "revisit" ? " gantt__segment--revisit" : ""}`}
                          style={{
                            background: s.color,
                            width: `${pct}%`,
                            flex: "none",
                          }}
                          title={`${s.listName}\n${fmtFull.format(s.from)} → ${fmtFull.format(s.to)}\n${Math.max(1, Math.round(dayDiff(s.from, s.to)))} jour(s)${s.state === "current" ? "\nColonne actuelle" : ""}${s.state === "revisit" ? "\nRetour dans cette colonne" : ""}${s.back ? "\n⬅ Retour en arrière dans le flux" : ""}`}
                        >
                          {showBack && s.back && (
                            <span
                              className="gantt__back"
                              aria-label="Retour en arrière"
                            >
                              ◀
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  {/* Libellé de la tâche, hors de la barre (cliquable -> carte Trello) */}
                  <span
                    className="gantt__bar-label--after"
                    style={{ left: left + width + 7 }}
                  >
                    {row.url ? (
                      <a
                        className="gantt__bar-link"
                        href={row.url}
                        target="_blank"
                        rel="noreferrer"
                        title="Ouvrir la carte dans Trello"
                      >
                        {row.name} ↗
                      </a>
                    ) : (
                      row.name
                    )}
                  </span>
                  {row.due && (
                    <div
                      className="gantt__due"
                      style={{ left: x(row.due) }}
                      title={`Échéance : ${fmtFull.format(row.due)}`}
                    />
                  )}
                  {(row.dueHistory || []).map((h, i) => (
                    <div
                      key={i}
                      className="gantt__due gantt__due--past"
                      style={{ left: x(h.due) }}
                      title={`Ancienne échéance : ${fmtFull.format(h.due)}${h.changedAt ? `\nrepoussée le ${fmtFull.format(h.changedAt)}` : ""}`}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
