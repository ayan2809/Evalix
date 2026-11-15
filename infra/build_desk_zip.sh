#!/usr/bin/env bash
# Build the front desk Lambda zip: arm64 wheels for Python 3.12 (Amazon Linux 2023, glibc 2.34),
# the backend app and its data files, and run.sh (started by the Lambda Web Adapter). No Docker.
# Prints the zip path.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/build"
PKG="$OUT/desk"
rm -rf "$PKG" "$OUT/evalix-desk.zip"
mkdir -p "$PKG"

cd "$ROOT/backend"
uv export --frozen --no-dev --no-hashes --no-emit-project -q -o "$OUT/desk-requirements.txt"
uv pip install -q --target "$PKG" --python-platform aarch64-manylinux_2_34 --python-version 3.12 \
  --only-binary=:all: --no-deps -r "$OUT/desk-requirements.txt"

cp -R app "$PKG/app"
cp -R data "$PKG/data"
cat > "$PKG/run.sh" <<'EOF'
#!/bin/sh
# Started by the Lambda Web Adapter, which passes each request to this server and streams the reply.
cd "$LAMBDA_TASK_ROOT"
exec python3 -m uvicorn app.main:app --host 127.0.0.1 --port "${AWS_LWA_PORT:-8080}" --no-access-log
EOF
chmod 755 "$PKG/run.sh"

find "$PKG" -name "__pycache__" -type d -prune -exec rm -rf {} +
find "$PKG" -name "*.pyc" -delete

cd "$PKG"
zip -q -r -X "$OUT/evalix-desk.zip" .
echo "unzipped: $(du -sh "$PKG" | cut -f1)  zipped: $(du -h "$OUT/evalix-desk.zip" | cut -f1)" >&2
echo "$OUT/evalix-desk.zip"
