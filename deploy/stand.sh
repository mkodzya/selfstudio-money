#!/bin/sh
# One stand of Money, by name.
#
#   deploy/stand.sh <prod|test> up            build, start, self-check, smoke; one verdict line
#   deploy/stand.sh <prod|test> ctl <...>     python -m moneyd.ctl <...> inside the stand's container
#   deploy/stand.sh <prod|test> logs [...]    the container's log (add -f to follow)
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
#   1. takes the lock /run/lock/money-deploy.lock - one Money deploy at a time,
#      whichever stand;
#   2. refuses when less than 700 MB of memory is available or another image
#      build is running: the machine also serves the platform's prod;
#   3. keeps the image the stand runs now as money-<stand>:previous;
#   4. builds money-<stand>:<version>, where <version> is `git describe` of
#      this checkout, on the newest patch of the base image;
#   5. `up -d --wait`: the new container has to report healthy;
#   6. `ctl selfcheck` inside it;
#   7. deploy/bin/money-smoke from the host, through the loopback port;
#   8. prints one verdict line, the last line of its output:
#        money-<stand>: OK - ...        or        money-<stand>: FAILED - ...
# When 5 or 6 fails, the previous image is started again and the exit status
# is not zero. When 4 fails, nothing was changed. When 7 fails, the new
# version stays up and the verdict says so.
#
# A stand is started only from its own checkout: prod from /opt/money, test
# from /opt/money-dev. Asking this file in one checkout to start the other
# stand would put the wrong branch on it, so `up` refuses. The words that only
# look, or talk to a container that is already running (ctl, logs, down, get,
# preflight), work from either.
#
# The five values of a stand file come from the file and from nowhere else: a
# MONEY_PORT or MONEY_PUBLIC_URL that happens to be in the caller's environment
# is overwritten here before compose sees it. MONEY_CSP and
# MONEY_CSP_OVERRIDE_UNTIL are the two that may be given for one deploy.
set -eu

PROD_HOME=/opt/money
TEST_HOME=/opt/money-dev
LOCK=/run/lock/money-deploy.lock
MEMINFO=/proc/meminfo
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

# A new container that is not fit to serve does not stay: the image the stand
# ran before is started again. $1 is what went wrong, for the verdict.
go_back() {
  warn "$PROJECT: $1"
  warn "--- the last lines of the container that failed ---"
  compose logs --tail 40 app >&2 || true
  if [ -z "$PREVIOUS" ]; then
    compose stop app >/dev/null 2>&1 || true
    verdict "FAILED - $1. There was no previous image to go back to, so the stand is stopped."
    exit 1
  fi
  warn "$PROJECT: starting the previous image again"
  MONEY_VERSION=previous
  export MONEY_VERSION
  if compose up -d --no-build --wait --wait-timeout "$WAIT_SECONDS" app; then
    verdict "FAILED - $1. The previous image is running again."
  else
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
}

do_up() {
  own_checkout
  preflight
  if [ ! -d "$MONEY_DATA_HOST_DIR" ]; then
    refuse "there is no data directory $MONEY_DATA_HOST_DIR. Make it first: install -d -o 10001 -g 10001 -m 700 $MONEY_DATA_HOST_DIR"
  fi

  MONEY_VERSION=$(version_of_checkout)
  export MONEY_VERSION

  POLICY=${MONEY_CSP:-}
  if [ -z "$POLICY" ]; then
    POLICY=$(from_file MONEY_CSP)
  fi
  if [ -n "$POLICY" ] && [ "$POLICY" != enforce ]; then
    warn "$PROJECT: NOTE - this deploy asks for MONEY_CSP=$POLICY"
  fi

  # The image the stand runs now, by its id: a tag can be moved by the build
  # below, an id cannot.
  PREVIOUS=""
  RUNNING=$(compose ps -a -q app 2>/dev/null | head -n 1)
  if [ -n "$RUNNING" ]; then
    PREVIOUS=$(docker inspect -f '{{.Image}}' "$RUNNING" 2>/dev/null) || PREVIOUS=""
  fi
  if [ -n "$PREVIOUS" ]; then
    if ! docker tag "$PREVIOUS" "$IMAGE_REPO:previous"; then
      warn "$PROJECT: could not keep the running image as $IMAGE_REPO:previous, so there is nothing to go back to"
      PREVIOUS=""
    fi
  fi

  say "$PROJECT: building $IMAGE_REPO:$MONEY_VERSION"
  if ! compose build --pull app; then
    verdict "FAILED - the image did not build. Nothing was changed: the stand runs what it ran before."
    exit 1
  fi

  say "$PROJECT: starting $IMAGE_REPO:$MONEY_VERSION"
  if ! compose up -d --no-build --wait --wait-timeout "$WAIT_SECONDS" app; then
    go_back "the new container did not report healthy within $WAIT_SECONDS s"
  fi
  if ! compose exec -T app python -m moneyd.ctl selfcheck; then
    go_back "the self-check failed"
  fi
  if ! "$ROOT/deploy/bin/money-smoke" "$STAND"; then
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
  compose down
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
    compose logs --tail 200 "$@" app
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
