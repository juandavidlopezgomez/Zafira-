#!/usr/bin/env bash
# ============================================================
# BattleFlirt — Script de despliegue para Hostinger compartido
# Ejecutar desde la raíz del proyecto: bash deploy-hostinger.sh
# Requiere: Node.js 20+, npm
# ============================================================
set -e

echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║   BattleFlirt — Build para Hostinger PHP     ║"
echo "╚══════════════════════════════════════════════╝"
echo ""

# ── 1. Build del frontend ──────────────────────────────────────
echo "==> [1/3] Instalando dependencias y compilando el frontend..."
cd frontend
npm install
npm run build
cd ..

# ── 2. Preparar carpeta de despliegue ─────────────────────────
echo "==> [2/3] Preparando carpeta deploy/..."
rm -rf deploy && mkdir -p deploy/api

# Frontend compilado → raíz (public_html en Hostinger)
cp -r frontend/dist/. deploy/

# Backend PHP → subcarpeta /api
cp -r backend-php/. deploy/api/

# Schema de la base de datos
mkdir -p deploy/database
cp database/schema.sql deploy/database/schema.sql

# ── 3. Instrucciones ──────────────────────────────────────────
echo ""
echo "==> [3/3] ¡Build completado!"
echo ""
echo "  Sube el contenido de deploy/ a tu public_html en Hostinger:"
echo ""
echo "  public_html/"
echo "  ├── index.html          ← React SPA"
echo "  ├── assets/             ← JS/CSS compilado"
echo "  ├── .htaccess           ← Rewrite para React Router"
echo "  ├── api/                ← Backend PHP"
echo "  │   ├── index.php"
echo "  │   ├── config.php      ← ¡RENOMBRA config.php desde el ejemplo!"
echo "  │   ├── .htaccess"
echo "  │   └── src/"
echo "  └── database/"
echo "      └── schema.sql      ← Importar en phpMyAdmin"
echo ""
echo "  PASOS EN HOSTINGER:"
echo "  1. Importar deploy/database/schema.sql en phpMyAdmin"
echo "  2. Editar deploy/api/config.php con tus credenciales MySQL"
echo "  3. Subir TODO el contenido de deploy/ a public_html/"
echo "  4. ¡Listo!"
echo ""
