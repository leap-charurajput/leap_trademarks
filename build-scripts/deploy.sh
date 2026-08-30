#!/usr/bin/env bash
#
# Deploy the built web app to the LEAP panel host.
#
# The CEP side of this panel is a thin redirect shell (zxp/plugin/web/public/redirect.html) that
# loads the real app from an HTTP origin. This script publishes that origin: it builds dist/ and
# rsyncs it to the static docroot on the version-check box, behind the nginx vhost that already
# terminates TLS for versioncheck.slsplugins.com.
#
# The origin itself is NOT configured here — it comes from plugin-origin.config.json, which
# `npm run build` injects into dist/app-config.json and into redirect.html. Change the origin
# there, not in this file.
#
# Usage:  ./build-scripts/deploy.sh [--no-build]
#
set -euo pipefail

HOST="ubuntu@50.18.2.155"
KEY="$HOME/.ssh/versioncheck_box"

cd "$(dirname "$0")/.."

# Panel path and origin are DERIVED from plugin-origin.config.json, which differs per release
# branch (main → panels/trademarks, development → panels/trademarks-dev, beta → panels/trademarks-beta).
# The nginx vhost serves any /panels/<name>/ path, so each branch deploys with this same script and
# no server changes. The localhost branch (a local origin) is rejected below.
ORIGIN="$(node -p "JSON.parse(require('fs').readFileSync('plugin-origin.config.json','utf8')).defaultOrigin")"
case "$ORIGIN" in
	*localhost*|*127.0.0.1*)
		echo "!! defaultOrigin is a local origin ($ORIGIN) — nothing to deploy from this branch."
		exit 1
		;;
esac
PANEL="${ORIGIN##*/}"
STAGING="panel-staging/$PANEL"          # writable by ubuntu; rsync target
DOCROOT="/var/www/leap-panels/panels/$PANEL"   # served by nginx; mirrors the URI path

if [ "${1:-}" != "--no-build" ]; then
	echo "==> Building"
	npm run build
fi

[ -f dist/index.html ] || { echo "!! dist/index.html missing — run npm run build first"; exit 1; }

# Guard against publishing a build whose origin does not match this branch. dist/app-config.json is
# what installed panels read to find their origin, so a wrong value here misroutes every client.
# Comparing the BUILT defaultOrigin against the one derived above catches both a stale local origin
# and any drift between plugin-origin.config.json and what actually landed in dist/.
#
# Do NOT grep the whole file for "localhost": app-config.json legitimately carries a localhost entry
# in its `environments` map, which made the old grep-based guard reject correct production builds.
DIST_ORIGIN="$(node -p "JSON.parse(require('fs').readFileSync('dist/app-config.json','utf8')).defaultOrigin")"
if [ "$DIST_ORIGIN" != "$ORIGIN" ]; then
	echo "!! dist/app-config.json defaultOrigin does not match this branch:"
	echo "!!   built:    $DIST_ORIGIN"
	echo "!!   expected: $ORIGIN"
	echo "!! Rebuild, or fix defaultOrigin in plugin-origin.config.json."
	exit 1
fi

echo "==> Uploading to $HOST"
ssh -i "$KEY" "$HOST" "mkdir -p ~/$STAGING"
rsync -az --delete -e "ssh -i $KEY" dist/ "$HOST:$STAGING/"

echo "==> Publishing to $DOCROOT"
ssh -i "$KEY" "$HOST" "
	set -e
	sudo mkdir -p '$DOCROOT'
	sudo rsync -a --delete ~/$STAGING/ '$DOCROOT/'
	sudo chown -R www-data:www-data /var/www/leap-panels
"

echo "==> Smoke test"
fail=0
for path in "/" "/app-config.json" "/libs/CSInterface.js"; do
	code=$(curl -s -m 15 -o /dev/null -w '%{http_code}' "$ORIGIN$path")
	printf '    %-24s %s\n' "$path" "$code"
	[ "$code" = "200" ] || fail=1
done
# The hashed asset name changes every build, so read it out of the deployed index.html.
asset=$(curl -s -m 15 "$ORIGIN/" | grep -o 'assets/[^"]*\.js' | head -1)
if [ -n "$asset" ]; then
	code=$(curl -s -m 15 -o /dev/null -w '%{http_code}' "$ORIGIN/$asset")
	printf '    %-24s %s\n' "/$asset" "$code"
	[ "$code" = "200" ] || fail=1
fi

if [ "$fail" != "0" ]; then
	echo "!! Smoke test failed — the deployed panel is not serving correctly."
	exit 1
fi

echo "==> Deployed: $ORIGIN"
