"""Regenerate ZMK's keycode names and aliases from a ZMK checkout's MIT-licensed keys.h."""
import json
import re
import subprocess
import sys
import tempfile
from pathlib import Path

include = Path(sys.argv[1]).resolve() / "app/include"
source = (include / "dt-bindings/zmk/keys.h").read_text()
names = re.findall(r"^#define ([A-Z][A-Z0-9_]*)\s+", source, re.MULTILINE)
# Let the C preprocessor resolve aliases, page IDs and encoded implicit modifiers.
with tempfile.TemporaryDirectory() as tmp:
    program = Path(tmp) / "codes"
    statements = [f'printf("%u %s\\n", (unsigned){name}, "{name}");' for name in names]
    c = '#include <stdio.h>\n#include <dt-bindings/zmk/keys.h>\nint main(void) {\n'
    subprocess.run(["cc", "-I", include, "-x", "c", "-", "-o", program],
                   input=c + "\n".join(statements) + "\n}", text=True, check=True)
    lines = subprocess.check_output([program], text=True).splitlines()
aliases = {}
for line in lines:
    value, name = line.split()
    aliases.setdefault(int(value), []).append(name)
output = Path(__file__).resolve().parents[1] / "src/lib/zmk/keycode-names.json"
output.write_text(json.dumps({key: " ".join(names) for key, names in sorted(aliases.items())},
                             indent=2) + "\n")
