"""Stand-ins for the commands Money's deploy scripts call on the server.

Never run on a server, and no part of the service. ``checks/test_deploy.py`` builds a
sandbox - a copy of ``deploy/`` in which every path of the server lies under a temporary
directory - and puts a launcher for each name below at the front of ``PATH``. The scripts
under test are the real ones; what they talk to is this file:

    docker      a small model of the daemon: images, tags, containers, their logs, compose
    git         a checkout with a version, a branch and tags
    flock  pgrep  systemctl  id  install  chown  date  sleep  tar  mktemp  money-smoke

Two things make the model worth having.

It remembers. Images keep their tags, a container keeps the environment it was started
with, and its log disappears with it, as Docker's does - so a test can ask what the stand
looks like after a deploy, a rollback or a restore, not only which commands were typed.

``python -m moneyd.ctl`` inside a container is the REAL command line of this checkout,
run on the directory the container has mounted as ``/data``: ``verify``, ``floor``,
``user list``, ``user retire-links``. So a whole-stand restore is tested against the code
that will run in the image. Only the words that need the running service (``ping``,
``selfcheck``, ``empty``, ``seed``, ``purge-snapshots``) are played from the plan.

The sandbox's state directory (``STANDIN_STATE``) holds

    state.json   the model, and ``plan``: what the next calls are to answer
    calls.log    one line per call, in order
    blocked      written by a ctl word the plan says to block on, just before it sleeps
    at-up, go    with "up_gate" in the plan: `compose up` writes the first and waits for the second

A queue in the plan (``"up": ["unhealthy", "healthy"]``) is used up one answer per call;
when it is empty the default answers.
"""
import json
import os
import sys

STATE_DIR = os.environ.get("STANDIN_STATE", "")
REPO = os.environ.get("STANDIN_REPO", "")
PYTHON = os.environ.get("STANDIN_PYTHON", sys.executable)
REAL_PATH = os.environ.get("STANDIN_REAL_PATH", "/usr/bin:/bin")

#: What deploy/compose.yml hands the container, as compose would work it out.
COMPOSE_ENV = (
    ("MONEY_STAND", None), ("MONEY_PUBLIC_URL", None), ("MONEY_FOUNDERS", None),
    ("MONEY_DATA_DIR", "/data"), ("MONEY_BIND", "0.0.0.0:8080"),
    ("MONEY_TRUSTED_PROXIES", "10.0.0.0/8,172.16.0.0/12,192.168.0.0/16"),
    ("MONEY_CSP", "enforce"), ("MONEY_CSP_OVERRIDE_UNTIL", ""), ("TZ", "UTC"),
)
#: The environment a call is written down with.
SHOWN = ("MONEY_STAND", "MONEY_VERSION", "MONEY_CSP", "MONEY_CSP_OVERRIDE_UNTIL")

#: ``python -m moneyd.ctl`` as the image runs it - except that the Mac's own Python has no
#: scrypt, which a prod stand asks for before it does anything. None of the words run here
#: hashes a password.
CTL = (
    "import sys\n"
    "from moneyd import config, ctl\n"
    "_from_env = config.Settings.from_env.__func__\n"
    "def from_env(cls, environ, clock=config.utcnow, scrypt_available=None):\n"
    "    return _from_env(cls, environ, clock, True)\n"
    "config.Settings.from_env = classmethod(from_env)\n"
    "sys.exit(ctl.main(sys.argv[1:]))\n"
)


# ---------------------------------------------------------------------------
# The state
# ---------------------------------------------------------------------------

def load():
    with open(os.path.join(STATE_DIR, "state.json"), "r") as handle:
        return json.load(handle)


def save(state):
    path = os.path.join(STATE_DIR, "state.json")
    with open(path + ".new", "w") as handle:
        json.dump(state, handle, indent=1, sort_keys=True)
    os.replace(path + ".new", path)


def note(line):
    with open(os.path.join(STATE_DIR, "calls.log"), "a") as handle:
        handle.write(line + "\n")


def take(state, key, default=0):
    """The next answer the plan holds for ``key``; ``default`` when it holds none."""
    queue = state["plan"].get(key)
    if isinstance(queue, list):
        if not queue:
            return default
        answer = queue.pop(0)
        save(state)
        return answer
    return default if queue is None else queue


def event(state, **fields):
    state["events"].append(fields)
    save(state)


def real(name, args):
    """Hand over to the machine's own command of that name."""
    import shutil           # here and not at the top: every call of a stand-in starts a Python
    path = shutil.which(name, path=REAL_PATH)
    if path is None:
        sys.stderr.write("stand-in: this machine has no %s\n" % name)
        sys.exit(127)
    os.execv(path, [name] + list(args))


def say(text):
    sys.stdout.write(text + "\n")
    sys.stdout.flush()


# ---------------------------------------------------------------------------
# docker: images and containers
# ---------------------------------------------------------------------------

def new_id(state, prefix):
    state["seq"] += 1
    return "%s%04d" % (prefix, state["seq"])


def image_of(state, ref):
    """The id of the image ``ref`` names - a tag or an id - or None."""
    if ref in state["images"]:
        return ref
    for image, record in state["images"].items():
        if ref in record["tags"]:
            return image
    return None


def put_tag(state, image, tag):
    for record in state["images"].values():
        if tag in record["tags"]:
            record["tags"].remove(tag)
    state["images"][image]["tags"].append(tag)


def container_of(state, ref):
    """The id of a container by id, by name or by compose project; None when there is none."""
    if ref in state["containers"]:
        return ref
    for cid, record in sorted(state["containers"].items()):
        if ref in (record.get("name"), record.get("project")):
            return cid
    return None


def log_path(cid):
    return os.path.join(STATE_DIR, "log-%s" % cid)


def write_log(cid, line):
    with open(log_path(cid), "a") as handle:
        handle.write(line + "\n")


def remove_container(state, cid):
    """As Docker does it: the container goes, and what it said goes with it."""
    state["containers"].pop(cid, None)
    try:
        os.unlink(log_path(cid))
    except OSError:
        pass


def print_log(state, cid, tail=None):
    source = state["plan"].get("logs_from") or log_path(cid)
    try:
        with open(source, "r") as handle:
            lines = handle.read().splitlines()
    except OSError:
        lines = []
    for line in (lines[-tail:] if tail else lines):
        say(line)


def env_file(path):
    values = {}
    try:
        with open(path, "r") as handle:
            for line in handle:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    key, _equals, value = line.partition("=")
                    values[key] = value
    except OSError:
        pass
    return values


def would_not_start(env):
    """moneyd's own boot refusals for the two policy settings (moneyd/config.py)."""
    mode = env.get("MONEY_CSP") or "enforce"
    until = env.get("MONEY_CSP_OVERRIDE_UNTIL") or ""
    if mode not in ("enforce", "report-only"):
        return True
    if until:
        parts = until.split("-")
        if len(until) != 10 or len(parts) != 3 or not all(part.isdigit() for part in parts):
            return True
    return mode == "report-only" and env.get("MONEY_STAND") == "prod" and not until


def ctl(state, args, data_dir=None, mounts=None, env=None, cid=None):
    """``python -m moneyd.ctl <args>`` inside a container. Ends the process."""
    mounts = mounts or {}
    env = env or {}
    words = " ".join(args[:2]) if args[:1] == ["user"] else (args[0] if args else "")
    event(state, cmd="ctl", args=list(args), words=words, container=cid, data=data_dir)
    if state["plan"].get("old_image") and words in ("floor", "user retire-links"):
        sys.stderr.write("python -m moneyd.ctl: error: argument <command>: invalid choice: %r\n" % words)
        sys.exit(2)
    asked_for_help = "--help" in args
    if state["plan"].get("block") == words and not asked_for_help:
        import time
        with open(os.path.join(STATE_DIR, "blocked"), "w") as handle:
            handle.write("%d\n" % os.getpid())
        time.sleep(120)
        sys.exit(1)
    # "ctl:floor": [0, 1] - the first call of that word goes as it goes, the second fails.
    forced = None if asked_for_help else take(state, "ctl:" + words, None)
    if forced:
        sys.stderr.write("moneyd.ctl: (stand-in) %s was told to fail\n" % words)
        sys.exit(int(forced))
    if words == "ping":
        sys.exit(int(take(state, "ping", 0)))
    if words == "selfcheck":
        status = int(take(state, "selfcheck", 0))
        say("self-check: %s (stand-in)" % ("OK - 15 checks passed" if status == 0 else "FAILED - 1 of 15 checks"))
        sys.exit(status)
    if words == "empty":
        status = int(take(state, "empty", 1))
        say("empty: both documents are at revision 0" if status == 0 else "not empty: the ledger is at revision 1")
        sys.exit(status)
    if words == "seed":
        got = sys.stdin.buffer.read()
        event(state, cmd="seed", kind=args[1] if len(args) > 1 else "", bytes=len(got), fresh="--fresh" in args)
        status = int(take(state, "seed", 0))
        say("seeded (stand-in)" if status == 0 else "the stand did not take the document (409 money_stale)")
        sys.exit(status)
    if words == "purge-snapshots":
        sys.exit(int(take(state, "purge", 0)))
    if data_dir is None and not mounts and "--help" not in args:
        say("ctl %s (stand-in: no data directory is known for this container)" % " ".join(args))
        sys.exit(0)
    # Everything else is the real command line, on the directory that is mounted as /data.
    environ = {
        "PATH": REAL_PATH, "PYTHONPATH": REPO, "PYTHONDONTWRITEBYTECODE": "1", "MONEY_WEB_DIR": REPO,
        "LC_ALL": "C",
    }
    environ.update({key: value for key, value in env.items() if key != "MONEY_DATA_DIR"})
    if data_dir is not None:
        environ["MONEY_DATA_DIR"] = data_dir
    argv = [mounts.get(word, word) if word.startswith("/") else word for word in args]
    if argv[:1] == ["verify"] and argv[1:2] == ["/data"] and data_dir is not None:
        argv[1] = data_dir
    import subprocess
    sys.exit(subprocess.call([PYTHON, "-B", "-c", CTL] + argv, env=environ, cwd=REPO))


def ctl_words(command):
    """What follows ``python -m moneyd.ctl`` in a command, or None."""
    if "moneyd.ctl" in command:
        return command[command.index("moneyd.ctl") + 1:]
    return None


def docker_compose(state, argv):
    project = env_path = None
    at = 0
    while at < len(argv) and argv[at] in ("-p", "--env-file", "-f"):
        if argv[at] == "-p":
            project = argv[at + 1]
        elif argv[at] == "--env-file":
            env_path = argv[at + 1]
        at += 2
    sub, rest = argv[at], argv[at + 1:]
    cid = container_of(state, project)
    stand = project.split("-", 1)[1]

    if sub == "ps":
        if cid:
            say(cid)
        return 0

    if sub == "build":
        status = int(take(state, "build", 0))
        if status:
            sys.stderr.write("failed to solve: (stand-in) the build was told to fail\n")
            return status
        tag = "money-%s:%s" % (stand, os.environ.get("MONEY_VERSION", "dev"))
        image = image_of(state, tag) if state["plan"].get("build_same") else None
        if image is None:
            image = new_id(state, "sha256:image")
            state["images"][image] = {"tags": []}
        put_tag(state, image, tag)
        event(state, cmd="build", tag=tag, image=image)
        return 0

    if sub == "up":
        from_file = env_file(env_path)
        env = {}
        for name, default in COMPOSE_ENV:
            env[name] = os.environ.get(name) or from_file.get(name) or (default or "")
        tag = "money-%s:%s" % (stand, os.environ.get("MONEY_VERSION", "dev"))
        image = image_of(state, tag)
        if image is None:
            sys.stderr.write("(stand-in) no such image: %s\n" % tag)
            event(state, cmd="up", tag=tag, image=None, env=env, outcome="no image", replaced=None)
            return 1
        outcome = take(state, "up", "healthy")
        if state["plan"].get("up_rule") == "moneyd" and would_not_start(env):
            outcome = "unhealthy"
        if state["plan"].get("up_gate"):
            # The test wants to do something while the container is being replaced: it is told that
            # the moment has come ("at-up") and says when to go on ("go").
            import time
            with open(os.path.join(STATE_DIR, "at-up"), "w") as handle:
                handle.write("%d\n" % os.getpid())
            waited = 0.0
            while not os.path.exists(os.path.join(STATE_DIR, "go")) and waited < 60:
                time.sleep(0.05)
                waited += 0.05
        replaced = None
        force = "--force-recreate" in rest
        if cid and (force or state["containers"][cid]["image"] != image or state["containers"][cid]["env"] != env):
            replaced = cid
            remove_container(state, cid)
            cid = None
        if cid is None:
            cid = new_id(state, "container")
            state["containers"][cid] = {
                "project": project, "name": "%s-app-1" % project, "image": image, "env": env,
                "data": os.environ.get("MONEY_DATA_HOST_DIR") or from_file.get("MONEY_DATA_HOST_DIR"),
            }
            write_log(cid, json.dumps({"event": "boot", "container": cid, "image": tag}))
        record = state["containers"][cid]
        record["status"] = "running" if outcome == "healthy" else "restarting"
        record["health"] = "healthy" if outcome == "healthy" else "unhealthy"
        event(state, cmd="up", tag=tag, image=image, env=env, outcome=outcome, replaced=replaced,
              container=cid, force=force)
        return 0 if outcome == "healthy" else 1

    if sub in ("stop", "start", "down"):
        if cid is None:
            return 0
        status = int(take(state, "compose-" + sub, 0))
        if status:
            return status
        if sub == "stop":
            if state["containers"][cid]["status"] != "exited":
                write_log(cid, json.dumps({"event": "stopped", "container": cid}))
            state["containers"][cid]["status"] = "exited"
        elif sub == "start":
            state["containers"][cid]["status"] = "running"
        else:
            remove_container(state, cid)
        event(state, cmd="compose-" + sub, container=cid)
        return 0

    if sub == "logs":
        status = int(take(state, "compose-logs", 0))
        if status:
            return status
        tail = int(rest[rest.index("--tail") + 1]) if "--tail" in rest else None
        if cid:
            print_log(state, cid, tail)
        return 0

    if sub == "exec":
        if cid is None or state["containers"][cid]["status"] != "running":
            sys.stderr.write("(stand-in) service \"app\" is not running\n")
            return 1
        words = ctl_words(rest)
        record = state["containers"][cid]
        ctl(state, words, data_dir=record.get("data") if state["plan"].get("ctl_on_stand") else None,
            env=record["env"], cid=cid)

    sys.stderr.write("(stand-in) docker compose %s is not played\n" % sub)
    return 64


def docker_run(state, argv):
    flags_with_value = ("--name", "--network", "--tmpfs", "--user", "--cap-drop", "--security-opt",
                        "--pids-limit", "--memory", "--cpus")
    detached = False
    name = network = None
    env = {}
    mounts = {}
    at = 0
    while at < len(argv):
        word = argv[at]
        if word == "-d":
            detached = True
        elif word in ("--rm", "--init", "--read-only"):
            pass
        elif word == "-e":
            key, equals, value = argv[at + 1].partition("=")
            env[key] = value if equals else os.environ.get(key, "")
            at += 1
        elif word == "-v":
            parts = argv[at + 1].split(":")
            mounts[parts[1]] = parts[0]
            at += 1
        elif word in flags_with_value:
            if word == "--name":
                name = argv[at + 1]
            elif word == "--network":
                network = argv[at + 1]
            at += 1
        elif word.startswith("-"):
            sys.stderr.write("(stand-in) docker run does not know %s\n" % word)
            return 64
        else:
            break
        at += 1
    image_ref, command = argv[at], argv[at + 1:]
    event(state, cmd="run", name=name, network=network, mounts=mounts, detached=detached, image=image_ref,
          command=command)

    if image_ref.startswith("node:"):
        status = int(take(state, "generator", 0))
        if status == 0:
            what, day = command[-2], command[-1]
            sys.stdout.write(json.dumps({"made": what, "day": day, "tx": [], "banks": []}))
        return status

    image = image_of(state, image_ref)
    if image is None:
        sys.stderr.write("(stand-in) Unable to find image %r locally\n" % image_ref)
        return 125
    if detached:
        status = int(take(state, "run", 0))
        if status:
            return status
        cid = new_id(state, "container")
        state["containers"][cid] = {
            "project": None, "name": name, "image": image, "env": env, "data": mounts.get("/data"),
            "status": "running", "health": "healthy", "network": network,
        }
        write_log(cid, json.dumps({"event": "boot", "container": cid}))
        save(state)
        say(cid)
        return 0
    words = ctl_words(command)
    if words is None:
        sys.stderr.write("(stand-in) docker run of %r is not played\n" % (command,))
        return 64
    ctl(state, words, data_dir=mounts.get("/data"), mounts=mounts, env=env, cid=name)
    return 0


def docker(argv):
    state = load()
    note("docker %s   [%s]" % (" ".join(argv), " ".join(
        "%s=%s" % (name, os.environ.get(name, "<unset>")) for name in SHOWN)))
    head = argv[0] if argv else ""

    if head == "compose":
        return docker_compose(state, argv[1:])
    if head == "run":
        return docker_run(state, argv[1:])

    if head == "inspect":
        fmt, cid = argv[2], container_of(state, argv[3])
        if cid is None:
            sys.stderr.write("(stand-in) no such object: %s\n" % argv[3])
            return 1
        record = state["containers"][cid]
        if fmt == "{{.Image}}":
            say(record["image"])
        elif fmt == "{{.State.Running}}":
            say("true" if record["status"] == "running" else "false")
        elif fmt.startswith("{{.State.Status}}"):
            say("%s %s" % (record["status"], record.get("health", "")))
        elif "Config.Env" in fmt:
            for name in sorted(record["env"]):
                say("%s=%s" % (name, record["env"][name]))
            say("")
        else:
            sys.stderr.write("(stand-in) docker inspect does not know %s\n" % fmt)
            return 64
        return 0

    if head == "image":
        sub = argv[1]
        if sub == "inspect":
            fmt, image = argv[3], image_of(state, argv[4])
            if image is None:
                sys.stderr.write("(stand-in) no such image: %s\n" % argv[4])
                return 1
            if fmt == "{{.Id}}":
                say(image)
            elif fmt == "{{len .RepoTags}}":
                say(str(len(state["images"][image]["tags"])))
            else:
                return 64
            return 0
        if sub == "ls":
            repo = argv[-1]
            listed = [(image, tag) for image, record in sorted(state["images"].items(), reverse=True)
                      for tag in record["tags"] if tag.split(":")[0] == repo]
            if "-q" in argv:
                seen = []
                for image, _tag in listed:
                    if image not in seen:
                        seen.append(image)
                        say(image)
            else:
                for _image, tag in listed:
                    say(tag.split(":", 1)[1])
            return 0
        if sub == "rm":
            ref = argv[2]
            image = image_of(state, ref)
            if image is None:
                return 1
            record = state["images"][image]
            in_use = any(container["image"] == image for container in state["containers"].values())
            if ref == image:
                if len(record["tags"]) > 1 or in_use:
                    sys.stderr.write("(stand-in) conflict: unable to delete %s\n" % image)
                    return 1
                del state["images"][image]
            else:
                record["tags"].remove(ref)
                if not record["tags"] and not in_use:
                    del state["images"][image]
            event(state, cmd="image-rm", ref=ref, image=image, gone=image not in state["images"])
            return 0
        return 64

    if head == "tag":
        status = int(take(state, "tag", 0))
        image = image_of(state, argv[1])
        if status or image is None:
            return status or 1
        put_tag(state, image, argv[2])
        event(state, cmd="tag", image=image, tag=argv[2])
        return 0

    if head == "ps":
        wanted = [word.split("=", 2)[2] for word in argv if word.startswith("label=com.docker.compose.project=")]
        cid = container_of(state, wanted[0]) if wanted else None
        if cid:
            say(cid)
        return 0

    if head in ("stop", "start"):
        cid = container_of(state, argv[-1])
        status = int(take(state, head, 0))
        if cid is None or status:
            return status or 1
        if head == "stop" and state["containers"][cid]["status"] != "exited":
            write_log(cid, json.dumps({"event": "stopped", "container": cid}))
        state["containers"][cid]["status"] = "exited" if head == "stop" else "running"
        event(state, cmd=head, container=cid)
        return 0

    if head == "rm":
        cid = container_of(state, argv[-1])
        if cid is not None:
            remove_container(state, cid)
        event(state, cmd="rm", ref=argv[-1], container=cid)
        return 0

    if head == "logs":
        status = int(take(state, "logs", 0))
        cid = container_of(state, argv[-1])
        if status or cid is None:
            sys.stderr.write("(stand-in) docker logs failed\n")
            return status or 1
        tail = int(argv[argv.index("--tail") + 1]) if "--tail" in argv else None
        print_log(state, cid, tail)
        return 0

    if head == "exec":
        rest = [word for word in argv[1:] if word not in ("-T", "-i", "-t")]
        cid = container_of(state, rest[0])
        if cid is None or state["containers"][cid]["status"] != "running":
            sys.stderr.write("(stand-in) container %s is not running\n" % rest[0])
            return 1
        record = state["containers"][cid]
        ctl(state, ctl_words(rest), data_dir=record.get("data"), env=record["env"], cid=cid)

    sys.stderr.write("(stand-in) docker %s is not played\n" % head)
    return 64


# ---------------------------------------------------------------------------
# The others
# ---------------------------------------------------------------------------

def git(argv):
    state = load()
    note("git %s   [cwd=%s]" % (" ".join(argv), os.getcwd()))
    plan = state["plan"]
    if argv[:1] == ["-C"]:
        argv = argv[2:]
    head = argv[0]
    if head == "describe":
        if "--exact-match" in argv:
            if plan.get("release"):
                say(plan["release"])
                return 0
            return 128
        say(plan.get("describe", "1.2.3-4-gabcdef0"))
        return 0
    if head == "log":
        say("abcdef0 A Verdict Phrase in the Style of the Times")
        return 0
    if head == "symbolic-ref":
        branch = plan.get("branch", "develop")
        if branch:
            say(branch)
            return 0
        return 1
    if head == "rev-parse":
        tag = argv[-1].split("refs/tags/", 1)[-1].split("^", 1)[0]
        return 0 if tag in plan.get("tags", {}) else 1
    if head == "cat-file":
        tag = argv[-1].split("refs/tags/", 1)[-1].split(":", 1)[0]
        return 0 if plan.get("tags", {}).get(tag) == "hosted" else 128
    if head in ("pull", "fetch", "checkout"):
        status = int(take(state, head, 0))
        if status == 0:
            event(state, cmd="git-" + head, args=argv[1:])
        return status
    return 0


def flock(argv):
    state = load()
    note("flock %s" % " ".join(argv))
    try:
        os.fstat(int(argv[-1]))
    except (OSError, ValueError):
        sys.stderr.write("(stand-in) flock: the caller has not opened descriptor %s\n" % argv[-1])
        return 99
    return int(take(state, "flock", 0))


def pgrep(argv):
    state = load()
    builds = state["plan"].get("builds")
    if builds:
        say(builds)
        return 0
    return 1


def systemctl(argv):
    state = load()
    note("systemctl %s" % " ".join(argv))
    unit = argv[-1]
    if argv[0] == "is-failed":
        return 0 if unit in state["plan"].get("failed_units", []) else 1
    if argv[0] == "is-enabled":
        return 0 if unit in state["plan"].get("enabled_units", ["money-test-reseed.timer"]) else 1
    return 0


def user_id(argv):
    if argv == ["-u"]:
        say(str(load()["plan"].get("uid", 0)))
        return 0
    real("id", argv)


def install(argv):
    """``install -d -o U -g G -m MODE DIR``: the directory and its mode; nobody here is root."""
    state = load()
    note("install %s" % " ".join(argv))
    status = int(take(state, "install", 0))
    if status:
        return status
    os.makedirs(argv[-1], exist_ok=True)
    os.chmod(argv[-1], int(argv[argv.index("-m") + 1], 8))
    return 0


def chown(argv):
    note("chown %s" % " ".join(argv))
    return 0


def date(argv):
    today = load()["plan"].get("today")
    if today and argv == ["-u", "+%Y-%m-%d"]:
        say(today)
        return 0
    real("date", argv)


def sleep(argv):
    note("sleep %s" % " ".join(argv))
    return 0


def tar(argv):
    state = load()
    if "-xzf" in argv and "-C" in argv:
        forced = take(state, "untar", None)
        if forced is not None:
            sys.stderr.write("(stand-in) tar: told to fail while unpacking\n")
            return int(forced)
    if "-czf" in argv and state["plan"].get("block") == "tar":
        # A backup that is interrupted while it is being written: the file is begun, and then nothing.
        import time
        with open(argv[argv.index("-czf") + 1], "wb") as handle:
            handle.write(b"half of an archive")
        with open(os.path.join(STATE_DIR, "blocked"), "w") as handle:
            handle.write("%d\n" % os.getpid())
        time.sleep(120)
        return 1
    real("tar", argv)


def mktemp(argv):
    """``mktemp -d`` in the sandbox's own temporary directory.

    GNU's goes by TMPDIR; the Mac's does not, and a work directory a script failed to remove would
    then lie where no test looks for it.
    """
    if argv == ["-d"]:
        argv = ["-d", os.path.join(os.environ["TMPDIR"], "tmp.XXXXXXXXXX")]
    real("mktemp", argv)


def money_smoke(argv):
    state = load()
    note("money-smoke %s" % " ".join(argv))
    status = int(take(state, "smoke", 0))
    say("money-smoke %s: %s (stand-in)" % (argv[0] if argv else "?", "all checks passed" if status == 0
                                           else "1 of 15 checks FAILED"))
    return status


COMMANDS = {
    "docker": docker, "git": git, "flock": flock, "pgrep": pgrep, "systemctl": systemctl, "id": user_id,
    "install": install, "chown": chown, "date": date, "sleep": sleep, "tar": tar, "mktemp": mktemp,
    "money-smoke": money_smoke,
}


if __name__ == "__main__":
    sys.exit(COMMANDS[sys.argv[1]](sys.argv[2:]) or 0)
