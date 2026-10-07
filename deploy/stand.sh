#!/bin/sh
# One stand of Money, by name.
#
#   deploy/stand.sh <prod|test> up            build, start, self-check, smoke; one verdict line
#   deploy/stand.sh <prod|test> ctl <...>     python -m moneyd.ctl <...> inside the stand's container
#   deploy/stand.sh <prod|test> logs [...]    the running container's log (add -f to follow)
#   deploy/stand.sh <prod|test> down          stop and remove the container; the data is not touched
#
# Everything here is one line with a name in front of it:
#
#   docker compose -p money-<stand> --env-file deploy/stands/<stand>.env -f deploy/compose.yml ...
#
# Two more words exist for the commands in deploy/bin, so that the refusals of
# a deploy and the reading of a stand file are written once:
#
#   deploy/stand.sh <prod|test> preflight     the refusals of `up`, and nothing else
#   deploy/stand.sh <prod|test> get <KEY>     one value of the stand file
#
# WHAT `up` DOES, in this order:
#   1. refuses a MONEY_CSP or MONEY_CSP_OVERRIDE_UNTIL the service would not
#      start on - before anything is touched (see THE POLICY below);
#   2. takes the lock /run/lock/money-deploy.lock - one Money deploy at a time,
#      whichever stand;
#   3. refuses when less than 700 MB of memory is available or another image
#      build is running: the machine also serves the platform's prod;
#   4. builds money-<stand>:<version>, where <version> is `git describe` of
#      this checkout, on the newest patch of the base image;
#   5. keeps the image the stand runs now as money-<stand>:previous - only when
#      its container is running and healthy: an image that never came up is
#      nothing to go back to;
#   6. stops the container the stand has, keeps what it said (THE REQUEST LOG
#      below) and starts a new one - always a new one, also for the same
#      version: `up -d --force-recreate --wait`, which has to report healthy.
#      While the stand is stopped by this script, Ctrl-C and a dropped
#      connection wait;
#   7. `ctl selfcheck` inside it;
#   8. deploy/bin/money-smoke from the host, through the loopback port;
#   9. removes the stand's older images: the running one and `previous` stay;
#  10. prints one verdict line, the last line of its output:
#        money-<stand>: OK - ...        or        money-<stand>: FAILED - ...
# When 6 or 7 fails, the previous image is started again - with the policy
# settings its own container had, not with those of the attempt that failed -
# and the exit status is not zero; when that does not come up either, the
# stand is stopped, not left in a restart loop. When 4 fails, nothing was
# changed. When 8 fails: on prod the previous image is started again as well
# (a stand that does not hold its refusals does not stay in front of the real
# money until somebody arrives); on test the new version stays up and the
# verdict says so.
#
# THE POLICY. MONEY_CSP and MONEY_CSP_OVERRIDE_UNTIL are the two settings that
# may be given for one deploy, in the caller's environment or in the stand
# file. They are checked here, before the lock, the build and the container:
#   - MONEY_CSP is enforce (the default) or report-only, nothing else;
#   - MONEY_CSP_OVERRIDE_UNTIL, when given, is a real day written YYYY-MM-DD;
#   - on prod, report-only needs that day, and the day must not have passed.
# The running service does not stop on an override that has ended - it goes
# back to enforcing and says so - which leaves this as the one place where a
# passed day is refused. A refusal ends with "Nothing was changed."
#
# THE REQUEST LOG. Who asked for what, and who saved, is the container's
# standard output, and Docker deletes it together with the container. So
# before a container is replaced (`up`, and the way back after a failed `up`)
# or removed (`down`), it is stopped and what it said is kept:
#
#   /var/log/money/<stand>/requests-<utc>.log.gz     mode 600, in a directory of mode 700
#
# one file for each container, named for the moment it was set aside; files
# older than 400 days are removed. `logs` shows the running container and says
# where these are.
#
# A stand is started only from its own checkout: prod from /opt/money, test
# from /opt/money-dev. Asking this file in one checkout to start the other
# stand would put the wrong branch on it, so `up` refuses. The words that only
# look, or talk to a container that is already running (ctl, logs, down, get,
# preflight), work from either.
#
# The five values of a stand file come from the file and from nowhere else: a
# MONEY_PORT or MONEY_PUBLIC_URL that happens to be in the caller's environment
# is overwritten here before compose sees it.
set -eu

PROD_HOME=/opt/money
TEST_HOME=/opt/money-dev
LOCK=/run/lock/money-deploy.lock
MEMINFO=/proc/meminfo
LOG_HOME=/var/log/money
KEEP_LOG_DAYS=400
MIN_AVAILABLE_MB=700
WAIT_SECONDS=120
# A client that is building an image: `docker build`, `docker buildx build`,
# `docker compose build`, `docker compose up --build`.
BUILD_PATTERN='docker.*[[:space:]](build|--build)([[:space:]]|$)'

say() {
  printf '%s\n' "$*"
}

warn() {
  printf '%s\n' "$*" >&2
}

# The same, for the moments when the stand is stopped by this script and a
# terminal that has gone away must not end the script before the stand is up.
mutter() {
  printf '%s\n' "$*" >&2 || true
}

die() {
  warn "stand.sh: $*"
  exit 1
}

usage() {
  warn "usage: stand.sh <prod|test> <up|ctl ...|down|logs [...]>"
  warn "       stand.sh <prod|test> <preflight|get <KEY>>"
  exit 2
}

# Where this file really is. `cd` and `pwd` are left logical on purpose: a
# checkout reached through a link keeps the name it was reached by.
SELF=$0
while [ -L "$SELF" ]; do
  TARGET=$(readlink "$SELF")
  case "$TARGET" in
    /*) SELF=$TARGET ;;
    *) SELF=$(dirname "$SELF")/$TARGET ;;
  esac
done
ROOT=$(cd "$(dirname "$SELF")/.." && pwd)

if [ $# -lt 2 ]; then
  usage
fi
STAND=$1
ACTION=$2
shift 2

case "$STAND" in
  prod) STAND_HOME=$PROD_HOME ;;
  test) STAND_HOME=$TEST_HOME ;;
  *) usage ;;
esac

ENV_FILE=$ROOT/deploy/stands/$STAND.env
COMPOSE_FILE=$ROOT/deploy/compose.yml
PROJECT=money-$STAND
IMAGE_REPO=money-$STAND
LOG_DIR=$LOG_HOME/$STAND
if [ ! -f "$ENV_FILE" ]; then
  die "no stand file $ENV_FILE"
fi
if [ ! -f "$COMPOSE_FILE" ]; then
  die "no compose file $COMPOSE_FILE"
fi

# One value of the stand file, read without sourcing it: it is not a shell
# script, and nothing in it should ever be executed.
from_file() {
  grep -E "^$1=" "$ENV_FILE" | head -n 1 | cut -d= -f2-
}

MONEY_STAND=$(from_file MONEY_STAND)
MONEY_PUBLIC_URL=$(from_file MONEY_PUBLIC_URL)
MONEY_FOUNDERS=$(from_file MONEY_FOUNDERS)
MONEY_PORT=$(from_file MONEY_PORT)
MONEY_DATA_HOST_DIR=$(from_file MONEY_DATA_HOST_DIR)
if [ "$MONEY_STAND" != "$STAND" ]; then
  die "$ENV_FILE says MONEY_STAND=$MONEY_STAND: it is not the file of the $STAND stand"
fi
if [ -z "$MONEY_PUBLIC_URL" ] || [ -z "$MONEY_FOUNDERS" ] || [ -z "$MONEY_PORT" ] || [ -z "$MONEY_DATA_HOST_DIR" ]; then
  die "$ENV_FILE must set MONEY_PUBLIC_URL, MONEY_FOUNDERS, MONEY_PORT and MONEY_DATA_HOST_DIR"
fi
export MONEY_STAND MONEY_PUBLIC_URL MONEY_FOUNDERS MONEY_PORT MONEY_DATA_HOST_DIR

compose() {
  docker compose -p "$PROJECT" --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"
}

# The last word of a deploy, on standard output whichever way it went:
#   money-<stand>: OK - ...        money-<stand>: FAILED - ...
verdict() {
  say "$PROJECT: $*"
}

# A deploy that does not even begin says so in the same words, and says that
# nothing was touched.
refuse() {
  verdict "FAILED - $*"
  exit 1
}

own_checkout() {
  if [ "$ROOT" != "$STAND_HOME" ]; then
    refuse "the $STAND stand is started only from $STAND_HOME, and this is $ROOT. Nothing was changed."
  fi
}

# ---------------------------------------------------------------------------
# The policy settings of one deploy
# ---------------------------------------------------------------------------

# A value somebody typed, cut down to what is safe to print on one line.
shown() {
  printf '%s' "$1" | LC_ALL=C tr -c 'A-Za-z0-9._:-' '?' | cut -c 1-32
}

# A day written YYYY-MM-DD as one number (20261110) - and nothing at all when
# $1 is not a real day: 2026-02-30 is not one, and neither is 12.11.2026.
day_number() {
  case "$1" in
    [0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]) ;;
    *) return 0 ;;
  esac
  DAY_YEAR=${1%%-*}
  DAY_REST=${1#*-}
  DAY_MONTH=${DAY_REST%%-*}
  DAY_DAY=${DAY_REST#*-}
  # No leading zero may reach the arithmetic: 08 and 09 are not octal numbers.
  DAY_YEAR=${DAY_YEAR#0}
  DAY_YEAR=${DAY_YEAR#0}
  DAY_YEAR=${DAY_YEAR#0}
  DAY_MONTH=${DAY_MONTH#0}
  DAY_DAY=${DAY_DAY#0}
  if [ "$DAY_YEAR" -lt 1 ] || [ "$DAY_MONTH" -lt 1 ] || [ "$DAY_MONTH" -gt 12 ] || [ "$DAY_DAY" -lt 1 ]; then
    return 0
  fi
  case "$DAY_MONTH" in
    4 | 6 | 9 | 11)
      DAY_LAST=30
      ;;
    2)
      DAY_LAST=28
      if [ "$((DAY_YEAR % 4))" -eq 0 ]; then
        if [ "$((DAY_YEAR % 100))" -ne 0 ] || [ "$((DAY_YEAR % 400))" -eq 0 ]; then
          DAY_LAST=29
        fi
      fi
      ;;
    *)
      DAY_LAST=31
      ;;
  esac
  if [ "$DAY_DAY" -gt "$DAY_LAST" ]; then
    return 0
  fi
  printf '%s' "$((DAY_YEAR * 10000 + DAY_MONTH * 100 + DAY_DAY))"
}

# Why the service would not take a mode ($1) and a day ($2) on this stand;
# nothing when it would. The rules are moneyd's own (moneyd/config.py), and
# one more that moneyd no longer applies once it runs: on prod the day of a
# report-only override must not have passed.
policy_problem() {
  case "$1" in
    enforce | report-only) ;;
    *)
      printf '%s' "MONEY_CSP must be enforce or report-only (got '$(shown "$1")'); there is no way to switch the policy off"
      return 0
      ;;
  esac
  UNTIL_NUMBER=""
  if [ -n "$2" ]; then
    UNTIL_NUMBER=$(day_number "$2")
    if [ -z "$UNTIL_NUMBER" ]; then
      printf '%s' "MONEY_CSP_OVERRIDE_UNTIL must be a real day written YYYY-MM-DD (got '$(shown "$2")')"
      return 0
    fi
  fi
  if [ "$1" != report-only ] || [ "$STAND" != prod ]; then
    return 0
  fi
  if [ -z "$UNTIL_NUMBER" ]; then
    printf '%s' "MONEY_CSP=report-only is refused on prod unless MONEY_CSP_OVERRIDE_UNTIL=YYYY-MM-DD names the day the override ends"
    return 0
  fi
  TODAY=$(date -u +%Y-%m-%d)
  TODAY_NUMBER=$(day_number "$TODAY")
  if [ -z "$TODAY_NUMBER" ]; then
    printf '%s' "this machine's clock does not give a day (date -u said '$(shown "$TODAY")'), so MONEY_CSP_OVERRIDE_UNTIL cannot be checked"
    return 0
  fi
  if [ "$UNTIL_NUMBER" -lt "$TODAY_NUMBER" ]; then
    printf '%s' "MONEY_CSP=report-only is refused on prod: MONEY_CSP_OVERRIDE_UNTIL=$2 has passed (today is $TODAY, UTC). Name a day that has not, or deploy without MONEY_CSP"
  fi
}

# The two settings as this deploy will hand them to the container: what the
# caller's environment says, else what the stand file says, else enforce.
# Refused here when the service would not start on them. They are exported as
# they were checked, so compose passes on exactly what was looked at.
check_policy() {
  POLICY=${MONEY_CSP:-}
  if [ -z "$POLICY" ]; then
    POLICY=$(from_file MONEY_CSP)
  fi
  if [ -z "$POLICY" ]; then
    POLICY=enforce
  fi
  POLICY_UNTIL=${MONEY_CSP_OVERRIDE_UNTIL:-}
  if [ -z "$POLICY_UNTIL" ]; then
    POLICY_UNTIL=$(from_file MONEY_CSP_OVERRIDE_UNTIL)
  fi
  PROBLEM=$(policy_problem "$POLICY" "$POLICY_UNTIL")
  if [ -n "$PROBLEM" ]; then
    refuse "$PROBLEM. Nothing was changed."
  fi
  MONEY_CSP=$POLICY
  MONEY_CSP_OVERRIDE_UNTIL=$POLICY_UNTIL
  export MONEY_CSP MONEY_CSP_OVERRIDE_UNTIL
}

# ---------------------------------------------------------------------------
# The refusals of a deploy
# ---------------------------------------------------------------------------

# One Money deploy at a time. A command of deploy/bin that already holds the
# lock says so, and its lock is kept for as long as that command lives.
take_lock() {
  if [ "${MONEY_DEPLOY_LOCK_HELD:-}" = 1 ]; then
    return 0
  fi
  if ! command -v flock >/dev/null 2>&1; then
    refuse "flock is not installed. Nothing was changed."
  fi
  exec 9>"$LOCK"
  if ! flock -n 9; then
    refuse "another Money deploy holds $LOCK. Nothing was changed."
  fi
  MONEY_DEPLOY_LOCK_HELD=1
  export MONEY_DEPLOY_LOCK_HELD
}

refuse_when_busy() {
  if [ -r "$MEMINFO" ]; then
    AVAILABLE_MB=$(awk '/^MemAvailable:/ { print int($2 / 1024) }' "$MEMINFO")
  else
    AVAILABLE_MB=""
  fi
  if [ -z "$AVAILABLE_MB" ]; then
    warn "$PROJECT: cannot read MemAvailable from $MEMINFO, so the memory rule was not checked"
  elif [ "$AVAILABLE_MB" -lt "$MIN_AVAILABLE_MB" ]; then
    refuse "only $AVAILABLE_MB MB of memory is available and a deploy needs $MIN_AVAILABLE_MB. Nothing was changed."
  fi
  BUILDS=$(pgrep -af "$BUILD_PATTERN" || true)
  if [ -n "$BUILDS" ]; then
    warn "$BUILDS"
    refuse "another image build is running on this machine (above). Nothing was changed."
  fi
}

preflight() {
  check_policy
  if ! command -v docker >/dev/null 2>&1; then
    refuse "docker is not installed. Nothing was changed."
  fi
  take_lock
  refuse_when_busy
}

# What is being deployed: `git describe` of this checkout, in the letters a
# docker tag and MONEY_VERSION both take, 64 at most.
version_of_checkout() {
  DESCRIBED=$(git -C "$ROOT" describe --tags --always --dirty 2>/dev/null) || DESCRIBED=""
  if [ -z "$DESCRIBED" ]; then
    DESCRIBED=dev
  fi
  printf '%s' "$DESCRIBED" | LC_ALL=C tr -c 'A-Za-z0-9_.-' '-' | cut -c 1-64
}

# ---------------------------------------------------------------------------
# What a container said, kept before the container goes
# ---------------------------------------------------------------------------

# Whether the directory of this stand's kept logs is there and can be written.
log_dir_ready() {
  if ! (umask 077 && mkdir -p "$LOG_DIR") 2>/dev/null; then
    return 1
  fi
  if ! chmod 700 "$LOG_DIR" 2>/dev/null; then
    return 1
  fi
  LOG_PROBE=$LOG_DIR/.writable-$$
  if ! (umask 077 && : > "$LOG_PROBE") 2>/dev/null; then
    return 1
  fi
  rm -f "$LOG_PROBE"
}

# Keep what container $1 has said, as one gzip file named for this moment.
# Leaves the file's name in KEPT_AS (empty when the container said nothing).
# Returns 1 when it could not be kept; then nothing half-written is left.
keep_log() {
  KEPT_AS=""
  if ! log_dir_ready; then
    return 1
  fi
  LOG_STAMP=$(date -u +%Y%m%dT%H%M%SZ)
  LOG_RAW=$LOG_DIR/.requests-$LOG_STAMP-$$.part
  LOG_PACKED=$LOG_DIR/.requests-$LOG_STAMP-$$.gz.part
  LOG_FILE=$LOG_DIR/requests-$LOG_STAMP.log.gz
  if ! (umask 077 && docker logs "$1" > "$LOG_RAW" 2>&1); then
    rm -f "$LOG_RAW"
    return 1
  fi
  if [ ! -s "$LOG_RAW" ]; then
    rm -f "$LOG_RAW"
    return 0
  fi
  if ! (umask 077 && gzip -c "$LOG_RAW" > "$LOG_PACKED"); then
    rm -f "$LOG_RAW" "$LOG_PACKED"
    return 1
  fi
  rm -f "$LOG_RAW"
  if [ -e "$LOG_FILE" ]; then
    # Two containers set aside within one second: gzip files may simply follow
    # one another, so the second is added to the first and nothing is replaced.
    if ! cat "$LOG_PACKED" >> "$LOG_FILE"; then
      rm -f "$LOG_PACKED"
      return 1
    fi
    rm -f "$LOG_PACKED"
  elif ! mv "$LOG_PACKED" "$LOG_FILE"; then
    rm -f "$LOG_PACKED"
    return 1
  fi
  KEPT_AS=$LOG_FILE
  find "$LOG_DIR" -name 'requests-*.log.gz' -type f -mtime "+$KEEP_LOG_DAYS" -delete 2>/dev/null || true
  # What an interrupted run left behind a day or more ago.
  find "$LOG_DIR" -name '.requests-*.part' -type f -mtime +0 -delete 2>/dev/null || true
}

# From the moment this script stops the stand's container until it has told
# compose to start the next one, a Ctrl-C or a dropped connection must not end
# the script: the stand would be left stopped. The three signals wait.
hold_signals() {
  trap '' INT TERM HUP
}

release_signals() {
  trap - INT TERM HUP
}

# The container the stand has now, running or not; nothing when it has none.
container_of_stand() {
  compose ps -a -q app 2>/dev/null | head -n 1
}

# ---------------------------------------------------------------------------
# up
# ---------------------------------------------------------------------------

# A new container that is not fit to serve does not stay: the image the stand
# ran before is started again, with the policy settings that image ran with.
# $1 is what went wrong, for the verdict.
go_back() {
  mutter "$PROJECT: $1"
  mutter "--- the last lines of the container that failed ---"
  compose logs --tail 40 app >&2 || true
  if [ -z "$PREVIOUS" ]; then
    compose stop app >/dev/null 2>&1 || true
    release_signals
    verdict "FAILED - $1. There was no previous image to go back to, so the stand is stopped."
    exit 1
  fi
  mutter "$PROJECT: starting the previous image again, with the policy it ran with (MONEY_CSP=$PREVIOUS_CSP)"
  MONEY_VERSION=previous
  MONEY_CSP=$PREVIOUS_CSP
  MONEY_CSP_OVERRIDE_UNTIL=$PREVIOUS_CSP_UNTIL
  export MONEY_VERSION MONEY_CSP MONEY_CSP_OVERRIDE_UNTIL
  hold_signals
  FAILED_CONTAINER=$(container_of_stand)
  if [ -n "$FAILED_CONTAINER" ]; then
    compose stop app >/dev/null 2>&1 || true
    if keep_log "$FAILED_CONTAINER"; then
      if [ -n "$KEPT_AS" ]; then
        mutter "$PROJECT: what the container that failed said is kept as $KEPT_AS"
      fi
    else
      mutter "$PROJECT: WARNING - what the container that failed said could not be kept in $LOG_DIR"
    fi
  fi
  if compose up -d --no-build --force-recreate --wait --wait-timeout "$WAIT_SECONDS" app; then
    release_signals
    forget_what_previous_named
    verdict "FAILED - $1. The previous image is running again."
  else
    # Not left in a restart loop: a stand that is down is stopped.
    compose stop app >/dev/null 2>&1 || true
    release_signals
    verdict "FAILED - $1. The previous image did not come up either: the stand is DOWN."
  fi
  exit 1
}

# One version back is enough to go back to; a tag checked out again rebuilds
# anything older. So the stand's other images go, and the disk does not fill
# with one image per deploy.
forget_older_images() {
  docker image ls --format '{{.Tag}}' "$IMAGE_REPO" | while read -r TAG; do
    case "$TAG" in
      "$MONEY_VERSION" | previous | "<none>" | "") ;;
      *) docker image rm "$IMAGE_REPO:$TAG" >/dev/null 2>&1 || true ;;
    esac
  done
  forget_what_previous_named
}

# The image that was `previous` before this deploy lost that name to the image
# the stand ran until now, and its version tag a deploy earlier. With no name
# left it would stay for good, so it is removed by its id - unless a tag still
# names it (the other stand may run the very same image) or `previous` is what
# it still is. Docker itself refuses to remove an image a container uses.
forget_what_previous_named() {
  if [ -z "$WAS_PREVIOUS" ]; then
    return 0
  fi
  PREVIOUS_NOW=$(docker image inspect -f '{{.Id}}' "$IMAGE_REPO:previous" 2>/dev/null) || PREVIOUS_NOW=""
  if [ "$WAS_PREVIOUS" = "$PREVIOUS_NOW" ]; then
    return 0
  fi
  NAMES_LEFT=$(docker image inspect -f '{{len .RepoTags}}' "$WAS_PREVIOUS" 2>/dev/null) || NAMES_LEFT=""
  if [ "$NAMES_LEFT" = 0 ]; then
    docker image rm "$WAS_PREVIOUS" >/dev/null 2>&1 || true
  fi
}

do_up() {
  own_checkout
  preflight
  if [ ! -d "$MONEY_DATA_HOST_DIR" ]; then
    refuse "there is no data directory $MONEY_DATA_HOST_DIR. Make it first: install -d -o 10001 -g 10001 -m 700 $MONEY_DATA_HOST_DIR"
  fi

  MONEY_VERSION=$(version_of_checkout)
  export MONEY_VERSION

  if [ "$MONEY_CSP" != enforce ]; then
    if [ -n "$MONEY_CSP_OVERRIDE_UNTIL" ]; then
      warn "$PROJECT: NOTE - this deploy asks for MONEY_CSP=$MONEY_CSP until $MONEY_CSP_OVERRIDE_UNTIL"
    else
      warn "$PROJECT: NOTE - this deploy asks for MONEY_CSP=$MONEY_CSP"
    fi
  fi

  # What the stand has now. Its container is replaced by this deploy whatever
  # state it is in, so there must be a place to keep what it said. Its image
  # is worth going back to only when it serves: running, and healthy by the
  # container's own health check. A container that a failed deploy left
  # stopped proves nothing about its image.
  PREVIOUS=""
  PREVIOUS_CSP=enforce
  PREVIOUS_CSP_UNTIL=""
  OUTGOING=$(container_of_stand)
  OUTGOING_RUNS=0
  if [ -n "$OUTGOING" ]; then
    if ! log_dir_ready; then
      refuse "what the stand's container has said could not be kept: $LOG_DIR cannot be made or written. Nothing was changed."
    fi
    OUTGOING_STATE=$(docker inspect -f '{{.State.Status}} {{if .State.Health}}{{.State.Health.Status}}{{end}}' "$OUTGOING" 2>/dev/null) || OUTGOING_STATE=""
    case "$OUTGOING_STATE" in
      running*) OUTGOING_RUNS=1 ;;
    esac
    if [ "$OUTGOING_STATE" = "running healthy" ]; then
      PREVIOUS=$(docker inspect -f '{{.Image}}' "$OUTGOING" 2>/dev/null) || PREVIOUS=""
      # The settings that container was started with: the way back uses them,
      # not the ones this deploy was given. An override that has ended since
      # is what the service already treats as enforce.
      OUTGOING_ENV=$(docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' "$OUTGOING" 2>/dev/null) || OUTGOING_ENV=""
      PREVIOUS_CSP=$(printf '%s\n' "$OUTGOING_ENV" | sed -n 's/^MONEY_CSP=//p' | head -n 1)
      PREVIOUS_CSP_UNTIL=$(printf '%s\n' "$OUTGOING_ENV" | sed -n 's/^MONEY_CSP_OVERRIDE_UNTIL=//p' | head -n 1)
      if [ -z "$PREVIOUS_CSP" ]; then
        PREVIOUS_CSP=enforce
      fi
      if [ -n "$(policy_problem "$PREVIOUS_CSP" "$PREVIOUS_CSP_UNTIL")" ]; then
        PREVIOUS_CSP=enforce
        PREVIOUS_CSP_UNTIL=""
      fi
    else
      warn "$PROJECT: the container the stand has now is not running and healthy (${OUTGOING_STATE:-its state cannot be read}), so its image is not kept as the one to go back to"
    fi
  fi
  # What `previous` names before this deploy moves the name.
  WAS_PREVIOUS=$(docker image inspect -f '{{.Id}}' "$IMAGE_REPO:previous" 2>/dev/null) || WAS_PREVIOUS=""

  say "$PROJECT: building $IMAGE_REPO:$MONEY_VERSION"
  if ! compose build --pull app; then
    verdict "FAILED - the image did not build. Nothing was changed: the stand runs what it ran before."
    exit 1
  fi

  # Only now, with a new image to start, does `previous` move to the image the
  # stand runs - by its id, which the build above cannot have moved.
  if [ -n "$PREVIOUS" ]; then
    if ! docker tag "$PREVIOUS" "$IMAGE_REPO:previous"; then
      warn "$PROJECT: could not keep the running image as $IMAGE_REPO:previous, so there is nothing to go back to"
      PREVIOUS=""
    fi
  fi

  # From here to the start of the new container the stand is down by this
  # script's own doing, so the script sees it through.
  hold_signals
  if [ -n "$OUTGOING" ]; then
    compose stop app >/dev/null 2>&1 || true
    if keep_log "$OUTGOING"; then
      if [ -n "$KEPT_AS" ]; then
        mutter "$PROJECT: what the container before this one said is kept as $KEPT_AS"
      fi
    else
      # A container whose log cannot be kept is not replaced: Docker would
      # delete the log with it. It is started again as it was.
      BACK=1
      if [ "$OUTGOING_RUNS" -eq 1 ]; then
        compose start app >/dev/null 2>&1 || BACK=0
      fi
      release_signals
      if [ "$BACK" -eq 1 ]; then
        verdict "FAILED - what the stand's container has said could not be kept in $LOG_DIR, so the container was not replaced. The stand is as it was before."
      else
        verdict "FAILED - what the stand's container has said could not be kept in $LOG_DIR, so the container was not replaced - and it did not start again: the stand is DOWN."
      fi
      exit 1
    fi
  fi

  mutter "$PROJECT: starting $IMAGE_REPO:$MONEY_VERSION"
  if ! compose up -d --no-build --force-recreate --wait --wait-timeout "$WAIT_SECONDS" app; then
    go_back "the new container did not report healthy within $WAIT_SECONDS s"
  fi
  release_signals
  # If the terminal went away while the three signals waited, there is nobody
  # left to tell and nothing below could be read: the script ends here, with
  # the new container up and healthy, rather than take a write that fails for
  # a check that failed and go back.
  if ! say "$PROJECT: $IMAGE_REPO:$MONEY_VERSION reports healthy; the self-check and the smoke follow"; then
    exit 1
  fi

  if ! compose exec -T app python -m moneyd.ctl selfcheck; then
    go_back "the self-check failed"
  fi
  if ! "$ROOT/deploy/bin/money-smoke" "$STAND"; then
    if [ "$STAND" = prod ]; then
      go_back "the smoke check failed on 127.0.0.1:$MONEY_PORT (the lines above say which refusal did not hold)"
    fi
    verdict "FAILED - the smoke check failed on 127.0.0.1:$MONEY_PORT. $MONEY_VERSION is still running: read the lines above, then fix forward or deploy the earlier version."
    exit 1
  fi

  forget_older_images
  # A command that has more to do after this (money-deploy-test seeds) asks
  # for the last word itself, so that a deploy ends with one verdict line.
  if [ "${MONEY_VERDICT:-}" = deferred ]; then
    say "$PROJECT: $MONEY_VERSION is up on 127.0.0.1:$MONEY_PORT; self-check and smoke passed"
  else
    verdict "OK - $MONEY_VERSION is up on 127.0.0.1:$MONEY_PORT; self-check and smoke passed"
  fi
}

# A terminal on both ends gets a terminal inside: `ctl user invite` prints its
# link to nothing else, and `ctl restore` asks a question. Anything piped in
# or out (a seed, a list for grep) goes without one.
do_ctl() {
  if [ -t 0 ] && [ -t 1 ]; then
    set -- exec app python -m moneyd.ctl "$@"
  else
    set -- exec -T app python -m moneyd.ctl "$@"
  fi
  compose "$@"
}

do_down() {
  if [ "$STAND" = prod ]; then
    say "About to stop Money's PROD stand. The data in $MONEY_DATA_HOST_DIR is not touched."
    say "Type the stand's name to go on:"
    read -r CONFIRM || CONFIRM=""
    if [ "$CONFIRM" != "$STAND" ]; then
      die "not confirmed - nothing done"
    fi
  fi
  # `down` removes the container, and Docker removes its log with it. So the
  # container is stopped first and what it said is kept; when that cannot be
  # done the stand stays stopped and the container stays where it is.
  OUTGOING=$(container_of_stand)
  if [ -n "$OUTGOING" ]; then
    compose stop app
    if ! keep_log "$OUTGOING"; then
      die "the $STAND stand is stopped, but its container was NOT removed: what it said could not be kept in $LOG_DIR. Make that directory writable, then run this again."
    fi
    if [ -n "$KEPT_AS" ]; then
      say "$PROJECT: what the container said is kept as $KEPT_AS"
    fi
  fi
  compose down
}

do_logs() {
  warn "$PROJECT: this is the container that runs now. What the containers before it said is kept in $LOG_DIR/requests-<utc>.log.gz, one file for each container that was replaced or removed, for $KEEP_LOG_DAYS days (read one with zcat)."
  compose logs --tail 200 "$@" app
}

do_get() {
  case "$1" in
    MONEY_STAND) say "$MONEY_STAND" ;;
    MONEY_PUBLIC_URL) say "$MONEY_PUBLIC_URL" ;;
    MONEY_FOUNDERS) say "$MONEY_FOUNDERS" ;;
    MONEY_PORT) say "$MONEY_PORT" ;;
    MONEY_DATA_HOST_DIR) say "$MONEY_DATA_HOST_DIR" ;;
    *) die "get: $1 is not a key of a stand file" ;;
  esac
}

case "$ACTION" in
  up)
    if [ $# -ne 0 ]; then
      usage
    fi
    do_up
    ;;
  ctl)
    if [ $# -lt 1 ]; then
      usage
    fi
    do_ctl "$@"
    ;;
  logs)
    do_logs "$@"
    ;;
  down)
    if [ $# -ne 0 ]; then
      usage
    fi
    do_down
    ;;
  preflight)
    if [ $# -ne 0 ]; then
      usage
    fi
    preflight
    ;;
  get)
    if [ $# -ne 1 ]; then
      usage
    fi
    do_get "$1"
    ;;
  *)
    usage
    ;;
esac
