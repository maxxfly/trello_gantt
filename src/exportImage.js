// Export du Gantt en image (PNG) ou PDF, en capturant la TOTALITÉ du contenu
// (et pas seulement la partie visible dans la zone défilante).
//
// Limite connue : html2canvas ne gère pas la propriété CSS `mask` (le bord
// « timbre » des tâches en cours) ni certains repeating-gradients : ces
// éléments peuvent apparaître simplifiés (barre pleine) dans l'export.

import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";

/**
 * Clone le noeud dans un conteneur hors écran sans limitation de scroll, afin
 * que html2canvas voie tout le contenu (largeur + hauteur réelles).
 * Retourne [noeud à capturer, fonction de nettoyage].
 */
/** Couleur de fond courante (var --panel), pour un export cohérent jour/nuit. */
function currentPanelBg() {
  return (
    getComputedStyle(document.documentElement).getPropertyValue("--panel").trim() ||
    "#ffffff"
  );
}

function openFullClone(el) {
  const bg = currentPanelBg();
  const wrapper = document.createElement("div");
  wrapper.style.cssText = `position:fixed;left:-100000px;top:0;z-index:-1;background:${bg};`;
  const clone = el.cloneNode(true);
  clone.style.margin = "0";
  wrapper.appendChild(clone);

  // --- Dimensions : tout le contenu, sans rognage -------------------------
  const scroller = el.querySelector(".gantt__scroll");
  const trackW = (() => {
    const track = el.querySelector(".gantt__row-track");
    return track ? track.offsetWidth : scroller ? scroller.scrollWidth - 320 : 0;
  })();

  // Colonne « Tâche » élargie pour contenir le nom le plus long en entier
  // (à l'écran il est tronqué par une ellipsis, ce que html2canvas recopie).
  let maxName = 0;
  el.querySelectorAll(".gantt__row-name").forEach((n) => {
    maxName = Math.max(maxName, n.scrollWidth);
  });
  const sideW = Math.min(640, Math.max(320, Math.ceil(maxName) + 12 + 80)); // + padding + avatars
  const EXTRA_RIGHT = 320; // place pour les libellés en fin de barre
  const totalW = sideW + trackW + EXTRA_RIGHT;

  clone.style.width = `${totalW}px`;
  clone.querySelectorAll(".gantt").forEach((g) => {
    g.style.width = `${totalW}px`;
    g.style.overflow = "visible";
  });
  const cInner = clone.querySelector(".gantt__inner");
  if (cInner) cInner.style.width = `${totalW}px`;

  // Neutralise le défilement et les hauteurs max sur le clone.
  clone.querySelectorAll(".gantt__scroll").forEach((s) => {
    s.style.overflow = "visible";
    s.style.maxHeight = "none";
    s.style.height = "auto";
  });
  // La mini-carte (vue d'ensemble + navigation) n'a aucun sens dans une image :
  // on la retire completement du clone.
  clone.querySelectorAll(".gantt__minimap").forEach((m) => m.remove());

  // --- Fin des troncatures de texte ---------------------------------------
  const widenSide = (n) => {
    n.style.flex = `0 0 ${sideW}px`;
    n.style.width = `${sideW}px`;
    n.style.overflow = "visible";
  };
  clone.querySelectorAll(".gantt__row-side, .gantt__header-side").forEach(widenSide);
  clone
    .querySelectorAll(
      ".gantt__row-name, .gantt__row-titles, .gantt__bar-label--after, .gantt__month",
    )
    .forEach((n) => {
      n.style.overflow = "visible";
      n.style.textOverflow = "clip";
      n.style.maxWidth = "none";
    });

  // Les éléments collants (sticky) n'ont plus de conteneur défilant : on les
  // fige en flux normal pour éviter chevauchements/superpositions à la capture.
  clone
    .querySelectorAll(".gantt__row-side, .gantt__header-side, .gantt__header")
    .forEach((n) => {
      n.style.position = "relative";
    });

  document.body.appendChild(wrapper);
  const cleanup = () => wrapper.remove();
  return [clone, cleanup];
}

/** Capture le Gantt (tout le contenu) en canvas. */
export async function captureGantt(el) {
  const [clone, cleanup] = openFullClone(el);
  try {
    // Double la résolution pour un rendu net.
    return await html2canvas(clone, {
      scale: 2,
      backgroundColor: currentPanelBg(),
      useCORS: true, // avatars Trello (images cross-origin)
      logging: false,
    });
  } finally {
    cleanup();
  }
}

function triggerDownload(href, filename) {
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/** Export PNG : le canvas est téléversé tel quel. */
export async function exportPng(el, filename) {
  const canvas = await captureGantt(el);
  const url = canvas.toDataURL("image/png");
  triggerDownload(url, filename.endsWith(".png") ? filename : `${filename}.png`);
}

/**
 * Export PDF paysage, mise à l'échelle sur la largeur de la page et saut de
 * page automatique si le Gantt est plus haut que la page.
 */
export async function exportPdf(el, filename, title = "Gantt") {
  const canvas = await captureGantt(el);
  const img = canvas.toDataURL("image/png");

  const pdf = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const margin = 24;
  const usableW = pageW - margin * 2;
  const bg = currentPanelBg();

  // Hauteur de l'image à la largeur utile.
  const imgH = (canvas.height / canvas.width) * usableW;

  pdf.setFontSize(12);
  pdf.text(title, margin, margin);

  if (imgH <= pageH - margin * 2 - 12) {
    // Tient sur une page : centré verticalement sous le titre.
    pdf.addImage(img, "PNG", margin, margin + 12, usableW, imgH);
  } else {
    // Morcele l'image sur plusieurs pages via un canvas tampon.
    const pxPerPt = canvas.width / usableW;
    const pageImgH = pageH - margin * 2 - 12; // hauteur d'image par page
    const sliceH = Math.floor(pageImgH * pxPerPt);
    let y = 0;
    let page = 0;
    while (y < canvas.height) {
      const h = Math.min(sliceH, canvas.height - y);
      const slice = document.createElement("canvas");
      slice.width = canvas.width;
      slice.height = h;
      const ctx = slice.getContext("2d");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, slice.width, slice.height);
      ctx.drawImage(canvas, 0, y, canvas.width, h, 0, 0, canvas.width, h);
      if (page > 0) pdf.addPage();
      pdf.addImage(
        slice.toDataURL("image/png"),
        "PNG",
        margin,
        margin + 12,
        usableW,
        h / pxPerPt
      );
      y += h;
      page += 1;
    }
  }
  pdf.save(filename.endsWith(".pdf") ? filename : `${filename}.pdf`);
}
