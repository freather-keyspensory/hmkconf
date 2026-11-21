# VIA definition catalog

Run `python3 scripts/build-via-catalog.py` before building after updating the source catalog.
The unified configurator translates custom menu labels and dropdown choices using its bundled dictionaries. Keyboard authors can override or extend these with an optional top-level `translations` object in the definition, for example `"translations": {"es": {"Installed Switch Type": "Tipo de interruptor instalado"}}`. Each language maps the original menu text to display text. Control IDs and option values use the original VIA definition.
The script reads `official/master` from the sibling via-keyboards checkout without changing its branch. Refresh with `git -C ../via-keyboards fetch --depth=1 official master`.

Legacy `src` definitions are selected for VIA protocol <=10; v3 definitions for newer firmware, with fallback if only one exists. Local *-via.json files override v3 entries. Preserve upstream licensing when distributing.

Current scope: VID/PID lookup, matching JSON import, default unrotated physical layout, layer/key reads and writes. Ambiguous hardware variants, rotated layouts and runtime multilayout selection need further work. Generic custom menus are not yet connected to hardware. Legacy M6-B protocol-8 RGB is separately supported.
