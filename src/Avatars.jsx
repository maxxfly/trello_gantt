// Petits composants utilitaires : avatars des membres et légende.

import React, { useEffect, useState } from "react";

const AVATAR_COLORS = [
  "#4f8ef7",
  "#f5a623",
  "#3ecf8e",
  "#e05c7a",
  "#9b6ef3",
  "#2bc4d3",
  "#f77f4f",
  "#8ab83c",
];

function colorFor(str) {
  let h = 0;
  for (let i = 0; i < (str || "").length; i++)
    h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

/**
 * Les URLs d'avatar Trello sont de la forme
 *   https://trello.com/1/t/<handle>/avatars/<id>.png           (taille par défaut)
 *   https://trello.com/1/t/<handle>/avatars/<id>/<n>.png       (taille n)
 * On force la variante 170px pour un rendu net (retina, avatars agrandis).
 * Les URLs externes (Gravatar…) sont laissées telles quelles.
 */
function hiResAvatar(url) {
  if (!url) return null;
  if (!/trello\.com\/1\/t\//.test(url)) return url;
  if (/\/avatars\/[^/]+\/\d+\.png$/.test(url)) return url.replace(/\/\d+\.png$/, "/170.png");
  return url.replace(/\.png$/, "/170.png");
}

export function Avatar({ member, size = 24 }) {
  const src = hiResAvatar(member?.avatarUrl);
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]); // nouvelle photo -> on réessaie
  const label = member?.fullName || member?.username || "?";
  const initials =
    member?.initials ||
    label
      .split(/\s+/)
      .map((w) => w[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();
  const style = {
    width: size,
    height: size,
    fontSize: Math.round(size * 0.45),
    background: colorFor(member?.username || label),
  };
  if (src && !failed) {
    return (
      <img
        className="avatar"
        style={style}
        src={src}
        alt={label}
        title={label}
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
      />
    );
  }
  return (
    <span className="avatar avatar--initials" style={style} title={label}>
      {initials}
    </span>
  );
}

export function AvatarStack({ members, size = 24, max = 4 }) {
  if (!members?.length) return null;
  const shown = members.slice(0, max);
  const extra = members.length - shown.length;
  return (
    <span className="avatar-stack">
      {shown.map((m, i) => (
        <Avatar key={m.id || i} member={m} size={size} />
      ))}
      {extra > 0 && (
        <span
          className="avatar avatar--extra"
          style={{
            width: size,
            height: size,
            fontSize: Math.round(size * 0.4),
          }}
        >
          +{extra}
        </span>
      )}
    </span>
  );
}
