#!/bin/bash
# First boot of the Evalix run engine (Amazon Linux 2023, arm64). Run by EC2 user-data as root.
# Safe to run again. Later boots don't run this: systemd starts evalix.target, whose first step
# (evalix-update) fetches the newest code.
#   bootstrap.sh <data-bucket> <region> <idle-minutes>
set -euo pipefail
BUCKET="$1"
REGION="${2:-ap-south-1}"
IDLE="${3:-15}"
BIFROST_VERSION=v2.5.1   # the version tested locally
UV_VERSION=0.11.3
HOME_DIR=/opt/evalix

echo "==> user and folders"
id evalix >/dev/null 2>&1 || useradd --system --home-dir "$HOME_DIR" --shell /sbin/nologin evalix
mkdir -p "$HOME_DIR"/{bin,data/bifrost,venvs,app}

echo "==> 2 GB swap (backend + Bifrost + four agents on 2 GB of memory)"
if [ ! -f /swapfile ]; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi
swapon -a || true

echo "==> tools"
dnf install -y -q tar gzip
if [ ! -x /usr/local/bin/uv ]; then
  curl -fsSL "https://github.com/astral-sh/uv/releases/download/${UV_VERSION}/uv-aarch64-unknown-linux-gnu.tar.gz" \
    | tar xz -C /tmp
  install -m 755 /tmp/uv-aarch64-unknown-linux-gnu/uv /usr/local/bin/uv
fi
if [ ! -x "$HOME_DIR/bin/bifrost-http" ]; then
  curl -fsSL -o "$HOME_DIR/bin/bifrost-http" \
    "https://downloads.getmaxim.ai/bifrost/${BIFROST_VERSION}/linux/arm64/bifrost-http"
  chmod 755 "$HOME_DIR/bin/bifrost-http"
fi

echo "==> settings for the services"
cat > "$HOME_DIR/engine.conf" <<EOF
AWS_REGION=$REGION
EVALIX_BUCKET=$BUCKET
EVALIX_IDLE_MINUTES=$IDLE
EOF

echo "==> the engine may switch its own machine off (stop, never delete), nothing else"
echo 'evalix ALL=(root) NOPASSWD: /usr/sbin/shutdown -h now' > /etc/sudoers.d/evalix
chmod 440 /etc/sudoers.d/evalix
visudo -cf /etc/sudoers.d/evalix

echo "==> first copy of the code, then the services"
aws s3 cp --region "$REGION" "s3://$BUCKET/artifacts/engine/evalix-update" /usr/local/bin/evalix-update
chmod 755 /usr/local/bin/evalix-update
/usr/local/bin/evalix-update --install-units
chown -R evalix:evalix "$HOME_DIR"
systemctl daemon-reload
systemctl enable evalix.target
systemctl start evalix.target
echo "==> done"
