#!/bin/sh
set -eu

# Vercel CI copies the checkout, but not the bootstrap instance's home directory.
export VP_HOME="$PWD/.vercel-ci/vite-plus"
export PATH="$VP_HOME/bin:$PATH"
export VP_NODE_MANAGER=yes

mkdir -p .vercel-ci
curl -fsSL https://vite.plus/install.sh -o .vercel-ci/install-vp.sh
bash .vercel-ci/install-vp.sh
vp install --frozen-lockfile
