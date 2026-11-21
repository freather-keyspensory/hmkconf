"""Read public ZMK configurations without executing repository code."""
import base64
import itertools
import math
import json
import re
from urllib.error import HTTPError
from urllib.parse import quote
from urllib.request import Request, urlopen

import yaml


def repository(value):
    if not isinstance(value, str):
        raise ValueError("Enter a public GitHub repository URL.")
    match = re.fullmatch(r"https://github\.com/([a-zA-Z0-9-]+)/([a-zA-Z0-9_.-]+)/?", value.strip())
    if not match:
        raise ValueError("Enter a public GitHub repository URL.")
    name = match[2].removesuffix(".git")
    if name in ("", ".", ".."):
        raise ValueError("Enter a public GitHub repository URL.")
    return "https://github.com/" + (match[1] + "/" + name).lower()


def github(repo, endpoint):
    url = "https://api.github.com/repos/" + repo.removeprefix("https://github.com/") + "/" + endpoint
    req = Request(url, headers={"User-Agent": "Keyspensory-firmware", "Accept": "application/vnd.github+json"})
    try:
        with urlopen(req, timeout=25) as response:
            return json.loads(response.read(2_000_000))
    except HTTPError as exc:
        if exc.code == 404:
            raise ValueError("Repository, revision, or required config file was not found on GitHub.") from exc
        raise ValueError(f"GitHub returned HTTP {exc.code}. Try again later.") from exc


def commit(repo, ref):
    sha = github(repo, "commits/" + quote(ref or "HEAD", safe=""))["sha"]
    if not re.fullmatch("[0-9a-f]{40}", sha):
        raise ValueError("Invalid GitHub revision.")
    return sha


def document(repo, sha, path):
    data = github(repo, "contents/" + path + "?ref=" + sha)
    if data.get("encoding") != "base64" or data["size"] > 256_000:
        raise ValueError(f"Cannot read {path}.")
    return yaml.safe_load(base64.b64decode(data["content"]))


def targets(matrix):
    if not isinstance(matrix, dict):
        raise ValueError("Expected a ZMK build matrix in build.yaml.")
    axes = {k: v for k, v in matrix.items() if k not in ("include", "exclude")}
    if any(not isinstance(v, list) for v in axes.values()):
        raise ValueError("Invalid build matrix axes.")
    if math.prod(len(v) for v in axes.values()) > 256 or len(matrix.get("include", [])) > 256:
        raise ValueError("Too many build targets.")
    original = []
    if axes:
        for values in itertools.product(*axes.values()):
            pair = dict(zip(axes, values))
            if not any(all(pair.get(k) == v for k, v in entry.items()) for entry in matrix.get("exclude", [])):
                original.append(pair)
            if len(original) > 256:
                raise ValueError("Too many build targets.")
    combinations = [dict(item) for item in original]
    for extra in matrix.get("include", []):
        matched = False
        for i, row in enumerate(original):
            if all(row[k] == v for k, v in extra.items() if k in axes):
                combinations[i].update(extra)
                matched = True
        if not matched:
            combinations.append(extra)
    result = []
    for row in combinations:
        if not isinstance(row, dict) or not isinstance(row.get("board"), str):
            raise ValueError("Each build target must specify a board.")
        target = {k: row[k] for k in ("board", "shield", "snippet", "cmake-args", "artifact-name") if row.get(k)}
        if not all(isinstance(value, str) for value in target.values()):
            raise ValueError("Unsupported target values in build.yaml.")
        if target not in result:
            result.append(target)
    if not result:
        raise ValueError("No keyboard targets were found in build.yaml.")
    return result


def inspect_project(url, ref):
    repo = repository(url)
    sha = commit(repo, ref)
    matrix = targets(document(repo, sha, "build.yaml"))
    manifest = document(repo, sha, "config/west.yml")["manifest"]
    remotes = {r["name"]: r["url-base"] for r in manifest.get("remotes", [])}
    defaults = manifest.get("defaults", {})
    projects = []
    for p in manifest.get("projects", []):
        remote = remotes.get(p.get("remote", defaults.get("remote")), "")
        projects.append({"name": p["name"], "url": p.get("url") or remote.rstrip("/") + "/" + p.get("repo-path", p["name"]),
                         "revision": p.get("revision", defaults.get("revision", "master"))})
    return {"repository": repo, "sha": sha, "targets": matrix, "projects": projects}
