#!/bin/sh
set -eu

# Vercel CI copies the checkout, but not the bootstrap instance's home directory.
export VP_HOME="$PWD/.vercel-ci/vite-plus"
export PATH="$VP_HOME/bin:$PATH"
export VP_NODE_MANAGER=yes

mkdir -p .vercel-ci/lib
# Node 26 needs libatomic, and bootstrap system libraries do not reach task instances.
if command -v dnf >/dev/null 2>&1; then
  if [ ! -f /usr/lib64/libatomic.so.1 ]; then
    dnf install -y libatomic
  fi
  cp -L /usr/lib64/libatomic.so.1 .vercel-ci/lib/
fi
export LD_LIBRARY_PATH="$PWD/.vercel-ci/lib${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"

curl -fsSL https://vite.plus/install.sh -o .vercel-ci/install-vp.sh
bash .vercel-ci/install-vp.sh || {
  status=$?
  cat "$VP_HOME/upgrade.log" >&2
  exit "$status"
}
vp install --frozen-lockfile
