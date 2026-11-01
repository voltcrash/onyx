#!/bin/sh
set -eu

export VP_HOME="$PWD/.vercel-ci/vite-plus"
export PATH="$VP_HOME/bin:$PATH"

exec vp "$@"
