"""Run only inside the build sandbox. Inputs are pinned before compilation."""
import json
import os
from pathlib import Path
import re
import shlex
import shutil
import subprocess
import sys
import yaml
from west.manifest import Manifest, ManifestImportFailed

work = Path.cwd()
request = json.loads((work / "request.json").read_text())
source = work / "source"
workspace = work / "workspace"
config = workspace / "config"


def run(*args, cwd=workspace):
    subprocess.run(args, cwd=cwd, check=True)


def seed_project(project, cache):
    mirror = cache / project.name
    path = Path(project.abspath)
    if not mirror.is_dir() or path.exists():
        return False
    def git_output(*args):
        return subprocess.check_output(["git", *args], text=True).strip()
    origin = git_output("-C", str(mirror), "config", "--get", "remote.origin.url")
    if origin.lower().removesuffix(".git") != project.url.lower().removesuffix(".git"):
        return False
    revision = project.revision
    sha = revision
    tag = None
    if not re.fullmatch(r"[a-fA-F0-9]{40}", sha):
        tagref = "refs/tags/" + revision
        headref = "refs/heads/" + revision
        refs = {ref: oid for oid, ref in (r.split() for r in git_output(
            "ls-remote", "--", project.url, tagref, tagref + "^{}", headref).splitlines())}
        sha = refs.get(tagref + "^{}") or refs.get(tagref) or refs.get(headref)
        if tagref in refs:
            tag = tagref
    if not sha or subprocess.run(["git", "-C", str(mirror), "cat-file", "-e", sha + "^{commit}"]).returncode:
        return False
    run("git", "init", "-q", str(path))
    run("git", "remote", "add", project.remote_name, project.url, cwd=path)
    run("git", "fetch", "-q", "--depth=1", str(mirror), sha, cwd=path)
    run("git", "update-ref", "refs/heads/manifest-rev", sha, cwd=path)
    if tag:
        run("git", "update-ref", tag, sha, cwd=path)
    run("git", "checkout", "-q", "--detach", sha, cwd=path)
    return True


def seed_dependencies(cache):
    # Resolve imports using west itself. Mirrors only supply objects for the
    # upstream URL and revision in this particular project's manifest.
    os.chdir(workspace)
    while True:
        try:
            manifest = Manifest.from_file()
            break
        except ManifestImportFailed as exc:
            if not exc.project or not seed_project(exc.project, cache):
                return
    for project in manifest.projects[1:]:
        if manifest.is_active(project):
            seed_project(project, cache)


def prepare():
    workspace.mkdir()
    run("git", "init", "-q", str(source))
    upstream = request["repository"]
    cache = Path(os.environ.get("WEST_NAME_CACHE", "/nonexistent")) / upstream.rsplit("/", 1)[1]
    if cache.is_dir() and subprocess.run(["git", "-C", str(cache), "cat-file", "-e", request["sha"] + "^{commit}"]).returncode == 0:
        upstream = str(cache)
    run("git", "fetch", "--depth=1", upstream, request["sha"], cwd=source)
    run("git", "checkout", "-q", "--detach", "FETCH_HEAD", cwd=source)
    if (source / "zephyr/module.yml").is_file():
        shutil.copytree(source / "config", config, symlinks=True)
    else:
        # Keep sibling directories used by relative keymap includes.
        for item in source.iterdir():
            item.rename(workspace / item.name)
    f = config / "west.yml"
    manifest = yaml.safe_load(f.read_text())
    projects = manifest["manifest"].setdefault("projects", [])
    for m in request["modules"]:
        projects.append({"name": m["name"], "url": m["url"], "revision": m["sha"]})
    f.write_text(yaml.safe_dump(manifest, sort_keys=False))
    run("west", "init", "-l", str(config))
    args = ["west", "update", "--narrow", "-o=--depth=1"]
    if os.environ.get("WEST_PROJECT_FILTER") and request["target"]["board"] == os.environ.get("WEST_FILTER_BOARD"):
        run("west", "config", "--local", "--", "manifest.project-filter", os.environ["WEST_PROJECT_FILTER"])
    if os.environ.get("WEST_NAME_CACHE"):
        seed_dependencies(Path(os.environ["WEST_NAME_CACHE"]))
    for attempt in range(2):
        try:
            run(*args)
            break
        except subprocess.CalledProcessError:
            if attempt:
                raise


def build():
    target = request["target"]
    zmk = Path(subprocess.check_output(["west", "list", "zmk", "-f", "{abspath}"], cwd=workspace, text=True).strip())
    args = ["west", "build", "-s", str(zmk / "app"), "-d", str(work / "build"), "-b", target["board"]]
    if target.get("snippet"):
        args += ["-S", target["snippet"]]
    args += ["--", "-DZMK_CONFIG=" + str(config), "-DZephyr_DIR=" + str(workspace / "zephyr/share/zephyr-package/cmake")]
    if target.get("shield"):
        args += ["-DSHIELD=" + target["shield"]]
    if (source / "zephyr/module.yml").is_file():
        args += ["-DZMK_EXTRA_MODULES=" + str(source)]
    args += [arg.replace("${ZMK_CONFIG}", str(config)) for arg in shlex.split(target.get("cmake-args", ""))]
    if request.get("overlay", "").strip():
        overlay = work / "module.overlay"
        overlay.write_text(request["overlay"])
        prefix = "-DEXTRA_DTC_OVERLAY_FILE="
        previous = [arg[len(prefix):] for arg in args if arg.startswith(prefix)]
        args = [arg for arg in args if not arg.startswith(prefix)]
        args.append(prefix + ";".join([*previous, str(overlay)]))
    settings = dict(line.split("=", 1) for line in request["settings"])
    args += ["-D" + k + "=" + v for k, v in settings.items()]
    os.environ["ZEPHYR_BASE"] = str(workspace / "zephyr")
    run(*args)
    zephyr = work / "build/zephyr"
    active = (zephyr / ".config").read_text().splitlines()
    for k, v in settings.items():
        if k + "=" + v not in active and not (v == "n" and f"# {k} is not set" in active):
            raise ValueError(k + " did not take effect for this target.")
    # A successful build can silently ignore a repository without a Zephyr module.
    discovered = (work / "build/zephyr_modules.txt").read_text().splitlines() if request["modules"] else []
    for module in request["modules"]:
        path = (workspace / module["name"]).resolve()
        if not any(':"' + str(path) + '":' in line for line in discovered):
            raise ValueError(module["name"] + " was not included by Zephyr.")
    for extension in ("uf2", "bin", "hex"):
        image = zephyr / ("zmk." + extension)
        if image.is_file() and image.stat().st_size:
            shutil.copyfile(image, work / ("firmware." + extension))
            return
    raise ValueError("The build produced no keyboard firmware image.")


if __name__ == "__main__":
    {"prepare": prepare, "build": build}[sys.argv[1]]()
