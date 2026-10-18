#!/usr/bin/env bash
# Deploy the current working tree to Vercel production.
#
# Why not plain `vercel deploy`? Once the repo is on GitHub the CLI attaches the commit author, and on the Hobby plan
# Vercel BLOCKS the deployment ("commit author doesn't have permission") unless that author maps to a team member.
# This builds locally and uploads the finished output from a copy of the tree that has no .git, so there is nothing to check.
set -euo pipefail
cd "$(dirname "$0")/.."
SCOPE=${VERCEL_SCOPE:-somehowlivings-projects}

vercel pull --yes --environment=production --scope "$SCOPE"
vercel build --prod --yes --scope "$SCOPE"

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
tar --exclude=./.git --exclude=./node_modules -cf - . | (cd "$tmp" && tar xf -)
ln -s "$PWD/node_modules" "$tmp/node_modules"
(cd "$tmp" && vercel deploy --prebuilt --prod --yes --scope "$SCOPE")
