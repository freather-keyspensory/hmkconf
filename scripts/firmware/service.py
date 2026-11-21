"""Loopback API for inspecting ZMK configs and downloading compiled firmware."""
from concurrent.futures import ThreadPoolExecutor
import hashlib
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import re
import threading
from urllib.parse import urlsplit
from uuid import uuid4

from project import commit, inspect_project, repository
from runner import compile_image, failure_detail

ROOT = Path(os.environ.get("ZMK_BUILD_STORAGE", Path.home() / "Library/Caches/keyspensory-firmware"))
ROOT.mkdir(mode=0o700, parents=True, exist_ok=True)
pool = ThreadPoolExecutor(max_workers=1)
lock = threading.Lock()
pending = set()
PREFIX = "/api/firmware"


def save(path, data):
    temporary = path.with_suffix(".tmp")
    temporary.write_text(json.dumps(data))
    temporary.replace(path)


def stored(identifier, name):
    if not isinstance(identifier, str) or not re.fullmatch(r"[a-f0-9]{32}", identifier):
        raise ValueError("Unknown build or configuration.")
    return json.loads((ROOT / identifier / name).read_text())


def build_job(job, request):
    stage = "Queued"
    progress = 1

    def update(next_stage, percent=None, **extra):
        nonlocal stage, progress
        next_progress = max(progress, percent or progress)
        if next_stage == stage and progress == next_progress and not extra:
            return
        stage, progress = next_stage, next_progress
        save(job / "status.json", {"id": job.name, "stage": stage, "progress": progress, **extra})

    try:
        update("Resolving module versions", 2)
        modules = request["modules"]
        for index, module in enumerate(modules, 1):
            module["sha"] = commit(module["url"], module["revision"])
            update("Resolving module versions", 2 + 7 * index // len(modules))
        save(job / "inputs.json", request)
        ext, data = compile_image(request, job, update)
        target = request["target"]
        label = target.get("artifact-name") or "-".join(filter(None, [target["board"], target.get("shield")]))
        filename = re.sub(r"[^a-zA-Z0-9._-]+", "-", label)[:100] + "-" + request["sha"][:8] + "." + ext
        (job / filename).write_bytes(data)
        update("Ready", 100, file=filename, bytes=len(data), sha256=hashlib.sha256(data).hexdigest())
    except Exception as exc:
        with (job / "build.log").open("a") as log:
            log.write(str(exc) + "\n")
        update("Failed", error=str(exc), detail=failure_detail(job / "build.log"))
    finally:
        with lock:
            pending.discard(job.name)


def enqueue(body):
    source = stored(body["source"], "source.json")
    index = body["target"]
    if type(index) != int or not 0 <= index < len(source["targets"]):
        raise ValueError("Select a target from the source repository.")
    selected = body.get("modules", [])
    if not isinstance(selected, list) or len(selected) > 64:
        raise ValueError("Invalid module selection.")
    existing = {p["name"] for p in source["projects"]}
    modules = []
    for item in selected:
        url = repository(item["url"])
        name = url.rsplit("/", 1)[1]
        if name in existing or name in ("config", "source", ".west", ".git"):
            raise ValueError(f"A project named {name} is already present.")
        existing.add(name)
        modules.append({"url": url, "name": name, "revision": str(item.get("revision") or "HEAD")[:256]})
    overlay = body.get("overlay", "")
    if not isinstance(overlay, str) or len(overlay) > 8192:
        raise ValueError("The devicetree overlay is too large.")
    settings = body.get("settings", [])
    if not isinstance(settings, list) or len(settings) > 128 or any(
        not isinstance(s, str) or not re.fullmatch(r'CONFIG_[A-Z0-9_]+=(?:[yn]|-?[0-9]+|0x[\da-fA-F]+|"[^"\n]{0,128}")', s) for s in settings):
        raise ValueError("Enter one CONFIG_NAME=value setting per line.")
    if len({s.split("=", 1)[0] for s in settings}) != len(settings):
        raise ValueError("A firmware setting was supplied more than once.")
    job = ROOT / uuid4().hex
    with lock:
        if len(pending) >= 4:
            raise ValueError("The build queue is full. Try again shortly.")
        job.mkdir()
        pending.add(job.name)
        save(job / "status.json", {"id": job.name, "stage": "Queued", "progress": 1})
        pool.submit(build_job, job, {"repository": source["repository"], "sha": source["sha"],
                    "target": source["targets"][index], "modules": modules, "settings": settings, "overlay": overlay})
    return {"id": job.name}


class Handler(BaseHTTPRequestHandler):
    def output(self, code, body, mime="application/json", filename=None):
        if mime == "application/json":
            body = json.dumps(body).encode()
        self.send_response(code)
        self.send_header("Content-Type", mime)
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        if filename:
            self.send_header("Content-Disposition", f'attachment; filename="{filename}"')
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        try:
            origin = urlsplit(self.headers.get("Origin", ""))
            if self.headers.get("Content-Type", "").split(";")[0] != "application/json" or (origin.netloc and origin.hostname not in ("localhost", "127.0.0.1", "::1")):
                return self.output(403, {"error": "This build service accepts local workspace requests."})
            size = int(self.headers.get("Content-Length", "0"))
            if not 0 < size <= 32768:
                raise ValueError("Invalid request size.")
            body = json.loads(self.rfile.read(size))
            if self.path == PREFIX + "/inspect":
                result = inspect_project(body["url"], str(body.get("revision") or "")[:256])
                result["id"] = uuid4().hex
                directory = ROOT / result["id"]
                directory.mkdir()
                save(directory / "source.json", result)
                return self.output(200, result)
            if self.path == PREFIX + "/jobs":
                return self.output(202, enqueue(body))
            self.output(404, {"error": "Unknown endpoint."})
        except (ValueError, KeyError, TypeError, OSError, AttributeError, IndexError) as exc:
            self.output(400, {"error": str(exc)})
        except Exception as exc:
            self.output(422, {"error": str(exc)})

    def do_GET(self):
        match = re.fullmatch(PREFIX + r"/jobs/([a-f0-9]{32})(?:/([\w.-]+))?", self.path)
        if not match:
            return self.output(404, {"error": "Build not found."})
        try:
            identifier, file = match.groups()
            state = stored(identifier, "status.json")
            if not file:
                if state["stage"] == "Failed" and "detail" not in state:
                    state["detail"] = failure_detail(ROOT / identifier / "build.log")
                return self.output(200, state)
            if file == "build.log":
                with (ROOT / identifier / file).open("rb") as f:
                    f.seek(max(0, f.seek(0, 2) - 100000))
                    return self.output(200, f.read(), "text/plain; charset=utf-8")
            if state.get("stage") == "Ready" and state.get("file") == file:
                return self.output(200, (ROOT / identifier / file).read_bytes(), "application/octet-stream", file)
        except FileNotFoundError:
            pass
        self.output(404, {"error": "File unavailable."})


if __name__ == "__main__":
    server = ThreadingHTTPServer(("127.0.0.1", int(os.environ.get("ZMK_BUILD_PORT", "4187"))), Handler)
    for path in ROOT.glob("*/status.json"):
        status = json.loads(path.read_text())
        if status["stage"] not in ("Ready", "Failed"):
            save(path, {**status, "stage": "Failed", "error": "The build service restarted. Start a new build."})
    server.serve_forever()
