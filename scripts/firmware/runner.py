"""Compile public firmware inputs in an isolated workspace on the local Mac."""
import json
import os
import re
import time
from pathlib import Path
import subprocess
import sys
import signal
import tempfile
import stat

WORKER = Path(__file__).with_name("worker.py").resolve()


NINJA_STEP = re.compile(rb"(?:^|[\r\n])\[(\d{1,9})/(\d{1,9})\] ")


def log_progress(phase, output):
    if phase == "prepare":
        if b"=== updating " in output:
            return 22
        if b"=== Initialized." in output:
            return 16
        return 10
    steps = [(int(done), int(total)) for done, total in NINJA_STEP.findall(output)]
    fractions = [done / total for done, total in steps if 0 < done <= total]
    if fractions:
        return 38 + int(60 * max(fractions))
    if b"-- west build: building application" in output:
        return 38
    return 30


def failure_detail(log):
    try:
        with log.open("rb") as stream:
            stream.seek(max(0, stream.seek(0, os.SEEK_END) - 128 * 1024))
            output = stream.read().decode(errors="replace")
    except FileNotFoundError:
        return None

    missing = re.search(r"Unmet or cyclic dependencies in modules:\s+([^\s]+)\s+depends on:\s*(\[[^\]\n]+\])", output)
    if missing:
        return f"{Path(missing[1]).name} → {missing[2]}"
    for line in output.splitlines():
        if re.search(r"(?i)(?:^|\s)(?:fatal )?error: ", line):
            return line.rsplit("/workspace/", 1)[-1].strip()[:480]
    return None


def wait_with_progress(proc, reader, phase, report):
    deadline = time.monotonic() + 1800
    carry = b""
    while True:
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            os.killpg(proc.pid, signal.SIGKILL)
            raise ValueError("The build timed out. See the build log.")
        try:
            proc.wait(timeout=min(0.4, remaining))
        except subprocess.TimeoutExpired:
            pass
        while chunk := reader.read(65536):
            output = carry + chunk
            report(log_progress(phase, output))
            carry = output[-48:]
        if proc.returncode is not None:
            return proc.returncode


def sandbox_run(directory, phase, log, report):
    if sys.platform != "darwin" or not os.environ.get("ZMK_BUILD_VENV") or not os.environ.get("ZMK_ARM_TOOLCHAIN"):
        raise ValueError("The build service needs a configured macOS ZMK toolchain.")
    venv = Path(os.environ["ZMK_BUILD_VENV"]).resolve()
    gcc = Path(os.environ["ZMK_ARM_TOOLCHAIN"]).resolve()
    if (phase == "build" and not (gcc / "bin/arm-none-eabi-gcc").is_file()) or not (venv / "bin/west").is_file():
        raise ValueError("The build service could not find west or the Arm compiler.")
    # Source trees may contain executable CMake and Python. Give the compiler
    # its own home and no network or access to the user's home directory.
    roots = [str(venv), str(gcc), str(WORKER.parent), "/usr", "/bin", "/sbin", "/System",
             "/Library/Developer/CommandLineTools", "/opt/homebrew", "/private/etc"]
    cache = os.environ.get("ZMK_WEST_CACHE")
    if cache and phase == "prepare":
        roots.append(str(Path(cache).resolve()))
    profile = ['(version 1)', '(deny default)', '(import "system.sb")',
               '(allow process-fork process-exec sysctl-read file-read-metadata)',
               '(allow signal (target self) (target children))',
               '(allow mach-lookup (global-name "com.apple.system.logger") (global-name "com.apple.system.notification_center"))',
               '(allow file-read* file-map-executable ' + ' '.join('(subpath ' + json.dumps(p) + ')' for p in roots) + ')',
               '(allow file-read* file-write* file-map-executable (subpath ' + json.dumps(str(directory)) + '))',
               '(allow file-read* file-write* (literal "/dev/null") (literal "/dev/zero") (literal "/dev/tty"))',
               '(allow file-read* (literal "/dev/random") (literal "/dev/urandom"))']
    if phase == "prepare":
        profile += ['(allow network-outbound (remote tcp))',
                    '(allow mach-lookup (global-name "com.apple.SystemConfiguration.DNSConfiguration") (global-name "com.apple.SystemConfiguration.configd") (global-name "com.apple.mDNSResponder"))',
                    '(allow file-read* (subpath "/Library/Keychains") (subpath "/private/var/db/ConfigurationProfiles"))']
    env = {"PATH": f"{venv}/bin:{gcc}/bin:/opt/homebrew/bin:/Library/Developer/CommandLineTools/usr/bin:/usr/bin:/bin:/usr/sbin",
           "HOME": str(directory / "home"), "TMPDIR": str(directory / "tmp"),
           "LANG": "en_US.UTF-8", "PYTHONNOUSERSITE": "1", "PYTHONDONTWRITEBYTECODE": "1",
           "GIT_TERMINAL_PROMPT": "0", "GIT_CONFIG_NOSYSTEM": "1", "GIT_CONFIG_GLOBAL": "/dev/null",
           "GIT_CONFIG_COUNT": "1", "GIT_CONFIG_KEY_0": "credential.helper", "GIT_CONFIG_VALUE_0": "",
           "GIT_ALLOW_PROTOCOL": "https", "ZEPHYR_TOOLCHAIN_VARIANT": "gnuarmemb", "GNUARMEMB_TOOLCHAIN_PATH": str(gcc)}
    if phase == "prepare":
        for name in ("HTTPS_PROXY", "https_proxy", "HTTP_PROXY", "http_proxy", "NO_PROXY"):
            if name in os.environ:
                env[name] = os.environ[name]
        if cache:
            env.update(WEST_NAME_CACHE=cache, GIT_ALLOW_PROTOCOL="https:file")
        if os.environ.get("ZMK_WEST_PROJECT_FILTER"):
            env["WEST_PROJECT_FILTER"] = os.environ["ZMK_WEST_PROJECT_FILTER"]
            env["WEST_FILTER_BOARD"] = os.environ.get("ZMK_WEST_FILTER_BOARD", "")
    command = ["/usr/bin/sandbox-exec", "-p", "\n".join(profile), str(venv / "bin/python"), str(WORKER), phase]
    with open(log.name, "rb") as reader:
        reader.seek(0, os.SEEK_END)
        with subprocess.Popen(command, cwd=directory, env=env, stdout=log, stderr=subprocess.STDOUT, start_new_session=True) as proc:
            rc = wait_with_progress(proc, reader, phase, report)
    if rc:
        raise ValueError("The source or modules could not be built for this target. See the build log.")


def compile_image(request, job, update):
    with tempfile.TemporaryDirectory(prefix="zmk-job-") as folder:
        work = Path(folder).resolve()
        for name in ("home", "tmp"):
            (work / name).mkdir()
        (work / "request.json").write_text(json.dumps(request))
        with (job / "build.log").open("ab") as log:
            for phase, label, start in (("prepare", "Fetching dependencies", 10), ("build", "Compiling firmware", 30)):
                update(label, start)
                sandbox_run(work, phase, log, lambda percent: update(label, percent))
        update("Verifying firmware", 99)
        for ext in ("uf2", "bin", "hex"):
            path = work / ("firmware." + ext)
            if path.is_symlink() or not path.is_file():
                continue
            with os.fdopen(os.open(path, os.O_RDONLY | os.O_NOFOLLOW), "rb") as source:
                info = os.fstat(source.fileno())
                if not stat.S_ISREG(info.st_mode) or not 0 < info.st_size <= 32 * 1024 * 1024:
                    raise ValueError("Invalid firmware image.")
                data = source.read()
            return ext, data
    raise ValueError("No firmware image was produced.")
