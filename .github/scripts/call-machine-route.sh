#!/usr/bin/env bash
#
# Calls one secret-protected machine route and reports what happened.
#
# Shared by every step in the scheduled-jobs workflow so the bearer handling,
# the timeouts and the retry policy exist once. Three copies of a curl
# invocation is three places for the auth header to be written slightly
# differently, and the one that drifts is the one that stops working quietly.
#
# Usage: call-machine-route.sh <METHOD> <PATH_WITH_QUERY>
# Requires: APP_BASE_URL, CRON_SECRET in the environment.

set -euo pipefail

method="${1:?method required}"
path="${2:?path required}"

: "${APP_BASE_URL:?APP_BASE_URL is not set}"
: "${CRON_SECRET:?CRON_SECRET is not set}"

# Trailing slashes on the base would produce a double slash, which some hosts
# redirect and curl would then replay as GET, silently turning a drain into a
# no-op that still looks successful.
base="${APP_BASE_URL%/}"
url="${base}${path}"

# The bearer token goes in a config file rather than on the command line.
# Anything on the command line is visible in `ps` on the runner and would be
# echoed by any future `set -x`, and a secret that leaks into a public
# repository's build log is a secret that has to be rotated.
config="$(mktemp)"
trap 'rm -f "$config"' EXIT
printf 'header = "Authorization: Bearer %s"\n' "$CRON_SECRET" > "$config"

echo "→ ${method} ${url}"

body_file="$(mktemp)"
trap 'rm -f "$config" "$body_file"' EXIT

# --retry covers a transient network fault or a cold start on the host, which
# are not incidents. It deliberately does NOT retry a 4xx: a rejected bearer
# token is a configuration fault and retrying it three times only delays
# finding out.
#
# `set -e` is suspended around this call on purpose. curl exits non-zero for a
# connection failure or a timeout, and letting that kill the script here would
# skip every diagnostic below it — the step would fail with no explanation of
# why, which is the silent failure this workflow exists to prevent. The exit
# code is captured and classified instead.
set +e
status="$(
  curl --silent --show-error \
       --config "$config" \
       --request "$method" \
       --max-time 120 \
       --connect-timeout 20 \
       --retry 2 \
       --retry-delay 5 \
       --retry-connrefused \
       --output "$body_file" \
       --write-out '%{http_code}' \
       "$url"
)"
curl_rc=$?
set -e

# curl writes no status when it never got a response. Normalise so the case
# below has one thing to match on.
if [ "$curl_rc" -ne 0 ] && { [ -z "$status" ] || [ "$status" = "000" ]; }; then
  status="000"
fi

echo "← HTTP ${status}"
echo "--- response body ---"
# Truncated: a drain that processed many jobs can return a long body, and the
# log is for diagnosis rather than for archiving payloads.
head -c 4000 "$body_file" || true
echo
echo "---------------------"

case "$status" in
  2*)
    exit 0
    ;;
  401 | 403)
    echo "::error title=Machine route rejected the bearer token::${method} ${path} returned ${status}. CRON_SECRET in this repository does not match the deployed environment, so the queue is not being drained."
    exit 1
    ;;
  000)
    echo "::error title=Machine route unreachable::${method} ${path} did not respond (curl exit ${curl_rc}). APP_BASE_URL may be wrong, the deployment may be down, or the request timed out. The queue is not being drained."
    exit 1
    ;;
  *)
    echo "::error title=Machine route failed::${method} ${path} returned ${status}."
    exit 1
    ;;
esac
