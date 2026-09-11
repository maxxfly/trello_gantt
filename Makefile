.PHONY: install dev build preview clean

# Installation des dépendances (si absentes)
install: node_modules/.installed

node_modules/.installed: package.json package-lock.json
	npm install
	touch $@

# Lancer le serveur de développement (http://localhost:5173)
dev: install
	npm run dev

# Build de production (dans dist/)
build: install
	npm run build

# Prévisualiser le build de production
preview: build
	npm run preview

# Nettoyer les artefacts de build
clean:
	rm -rf dist

# Tout nettoyer y compris node_modules
distclean: clean
	rm -rf node_modules
