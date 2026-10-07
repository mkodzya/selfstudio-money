# Money's image: Python's own image and three COPY lines.
#
# No pip, no apk, no compile. The service is standard library only, so a build
# is a copy and takes seconds. On a machine that also serves the platform's
# prod, that is the point: nothing heavy ever runs there for Money.
#
#   docker build -f deploy/Dockerfile -t money .        (from the repository root)
#
# The context is the repository root, and .dockerignore there is an allow-list:
# moneyd/, index.html and vendor/ are all that can reach a build, whatever else
# lies beside them. The laptop tool keeps the real ledger in data/ beside the
# code; an allow-list is what keeps that folder out of every image for good.
FROM python:3.13-alpine

# A user that owns nothing in the image. The number is what matters: the data
# directory on the host belongs to 10001, and compose starts the container as
# 10001 whatever this file says.
RUN adduser -D -H -u 10001 money

WORKDIR /app
# The files keep the modes they have in the checkout, and are read by 10001:
# a checkout made under a umask of 077 would build an image that cannot start.
COPY moneyd/ /app/moneyd/
COPY index.html /app/web/index.html
COPY vendor/ /app/web/vendor/

# The one thing a build is told: `git describe` of the checkout it was made
# from. /api/me and `ctl selfcheck` report it. Declared after the COPY lines so
# that a new version does not throw the copied layers away.
ARG MONEY_VERSION=dev
ENV MONEY_VERSION=$MONEY_VERSION \
    MONEY_WEB_DIR=/app/web \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

USER 10001
EXPOSE 8080
CMD ["python", "-m", "moneyd"]
