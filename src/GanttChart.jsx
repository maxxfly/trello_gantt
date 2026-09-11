import React, { useMemo, useRef, useState } from "react";
import { AvatarStack } from "./Avatars.jsx";
import { STEP_STATE_META } from "./ganttModel.js";

const DAY_MS = 24 * 60 * 60 * 1000;

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
  const scrollRef = useRef(null);

  const totalDays = Math.max(1, dayDiff(min, max));
  const totalWidth = totalDays * pxPerDay;
  const x = (date) => dayDiff(min, date) * pxPerDay;

  const weekTicks = useMemo(() => buildWeekTicks(min, max), [min, max]);
  const monthTicks = useMemo(() => buildMonthTicks(min, max), [min, max]);
  const todayX = x(new Date(new Date().setHours(0, 0, 0, 0)));
  const todayVisible = todayX >= 0 && todayX <= totalWidth;

  return (
    <div className="gantt">
      <div className="gantt__toolbar">
        <h2 className="gantt__title">{title}</h2>
        <div className="gantt__zoom">
          <span>Zoom</span>
          <input
            type="range"
            min="8"
            max="80"
            value={pxPerDay}
            onChange={(e) => setPxPerDay(Number(e.target.value))}
          />
        </div>
      </div>

      <div className="gantt__scroll" ref={scrollRef}>
        <div className="gantt__inner" style={{ width: 320 + totalWidth }}>
          {/* En-tête timeline */}
          <div className="gantt__header">
            <div className="gantt__header-side">Tâche</div>
            <div className="gantt__header-track" style={{ width: totalWidth }}>
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
            const segments =
              row.steps.length > 0
                ? row.steps
                : [{ name: null, state: "none" }];
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
                  <span className="gantt__row-name">{row.name}</span>
                  <AvatarStack members={row.members} size={22} max={3} />
                </div>
                <div className="gantt__row-track" style={{ width: totalWidth }}>
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
                    className={`gantt__bar${row.steps.length === 0 ? " gantt__bar--plain" : ""}`}
                    style={{
                      left,
                      width,
                      opacity: row.closed ? 0.45 : 1,
                    }}
                  >
                    {segments.map((s, i) =>
                      s.state === "none" ? (
                        <div
                          key={i}
                          className="gantt__segment"
                          style={{ background: row.color, flex: 1 }}
                          title={`${row.name}\n${fmtFull.format(row.start)} → ${fmtFull.format(row.end)}\nListe : ${row.listName}`}
                        >
                          <span className="gantt__bar-label">{row.name}</span>
                        </div>
                      ) : (
                        <div
                          key={i}
                          className="gantt__segment"
                          style={{
                            background: STEP_STATE_META[s.state].color,
                            flex: 1,
                          }}
                          title={`Étape ${i + 1}/${row.steps.length} : ${s.name}\nStatut : ${STEP_STATE_META[s.state].label}${s.due ? `\nÉchéance : ${fmtFull.format(s.due)}` : ""}`}
                        />
                      ),
                    )}
                    {row.steps.length > 0 && (
                      <span
                        className="gantt__bar-label gantt__bar-label--after"
                        title={`${row.name} — ${row.listName}`}
                      >
                        {row.name}
                      </span>
                    )}
                  </div>
                  {row.due && (
                    <div
                      className="gantt__due"
                      style={{ left: x(row.due) }}
                      title={`Échéance : ${fmtFull.format(row.due)}`}
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
