import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

// Enregistrement du service worker (PWA / hors-ligne). Chemins relatifs au
// dossier de l'app pour rester compatible avec un déploiement en sous-dossier.
if ("serviceWorker" in navigator) {
  const base = new URL(
    "./",
    document.baseURI || window.location.href,
  ).href;
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register(`${base}sw.js`, { scope: base })
      .catch(() => {
        /* SW indisponible (http non-sécurisé, navigation privée…) : sans blocage */
      });
  });
}
