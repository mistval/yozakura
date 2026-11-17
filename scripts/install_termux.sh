#!/usr/bin/env bash

set -euo pipefail

export DEBIAN_FRONTEND=noninteractive

REPO_URL="${YOZAKURA_REPO_URL:-https://github.com/mistval/yozakura.git}"
BRANCH="${YOZAKURA_BRANCH:-main}"
INSTALL_DIR="${YOZAKURA_DIR:-$HOME/yozakura}"
START_SCRIPT="$HOME/start_yozakura.sh"

pkg update -y </dev/null
apt-get upgrade -y \
  -o Dpkg::Options::="--force-confdef" \
  -o Dpkg::Options::="--force-confold" </dev/null
pkg install -y git nodejs-lts python3 make clang binutils sqlite </dev/null

if [ ! -d "$INSTALL_DIR/.git" ]; then
  git clone -b "$BRANCH" "$REPO_URL" "$INSTALL_DIR"
fi

cat <<EOF > "$START_SCRIPT"
#!/usr/bin/env bash

set -euo pipefail

cd "$INSTALL_DIR"

# Restore package manifests before pulling in case Electron removal modified them on an earlier run.
git checkout -- package.json package-lock.json 2>/dev/null || true

BEFORE_REV="\$(git rev-parse HEAD)"
git pull --ff-only
AFTER_REV="\$(git rev-parse HEAD)"

if [ "\$BEFORE_REV" != "\$AFTER_REV" ] || [ ! -f "client/dist/index.html" ] || [ ! -d "node_modules" ] || [ ! -d "server/node_modules" ]; then
  npm remove electron @electron-forge/cli @electron-forge/maker-zip @electron-forge/plugin-auto-unpack-natives
  npm install
  GYP_DEFINES="android_ndk_path=''" npm --prefix server install
  npm run install:all
  npm run build:web
fi

PORT=4396 npm run start --prefix server
EOF

chmod +x "$START_SCRIPT"
exec "$START_SCRIPT"
