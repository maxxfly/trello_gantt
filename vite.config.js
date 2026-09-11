import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Chemins relatifs dans le build : permet de servir le projet depuis
  // n'importe quel sous-dossier (ex: https://serveur/monSousDossier/)
  base: './',
  server: { port: 5173, open: true },
});
