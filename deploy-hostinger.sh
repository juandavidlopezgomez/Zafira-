#!/usr/bin/env bash
# ============================================================
# BattleFlirt — Script de despliegue para Hostinger
# Ejecutar desde la raíz del proyecto: bash deploy-hostinger.sh
# ============================================================
set -e

echo "==> [1/4] Instalando dependencias del backend..."
cd backend
npm install --omit=dev
npm run build
cd ..

echo "==> [2/4] Construyendo el frontend..."
cd frontend
npm install
npm run build
cd ..

echo "==> [3/4] Preparando carpeta de despliegue..."
mkdir -p deploy/backend
cp -r backend/dist      deploy/backend/dist
cp -r backend/node_modules deploy/backend/node_modules
cp    backend/package.json deploy/backend/package.json
cp -r frontend/dist     deploy/frontend-dist

echo ""
echo "==> [4/4] LISTO. Sube el contenido de 'deploy/' a Hostinger."
echo ""
echo "  Estructura en Hostinger (Node.js app):"
echo "  /home/tuusuario/battleflirt/"
echo "    ├── backend/   ← contenido de deploy/backend/"
echo "    ├── frontend/dist/ ← contenido de deploy/frontend-dist/"
echo "    └── .env       ← copia .env.example y completa las variables"
echo ""
echo "  En el Panel de Hostinger > Node.js:"
echo "    - Carpeta de la app: /home/tuusuario/battleflirt/backend"
echo "    - Archivo de inicio: dist/main.js"
echo "    - Versión Node.js: 20.x"
echo ""
echo "  Recuerda importar database/schema.sql en phpMyAdmin antes de iniciar."
