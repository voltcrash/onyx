#!/bin/sh
set -eu

export VP_HOME="$PWD/.vercel-ci/vite-plus"
export PATH="$VP_HOME/bin:$PATH"
export LD_LIBRARY_PATH="$PWD/.vercel-ci/lib${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"

exec vp "$@"
