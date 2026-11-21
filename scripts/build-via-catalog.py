"""Generate an offline VIA catalog from source definitions; local overrides win."""
import json, pathlib, subprocess
root=pathlib.Path(__file__).resolve().parents[1]
repo=root.parent/'via-keyboards'
out=root/'static/definitions'
out.mkdir(parents=True,exist_ok=True)
entries={}
# Use a fetched official snapshot without modifying the existing fork checkout.
ref='official/master'
if subprocess.run(['git','-C',str(repo),'rev-parse','--verify',ref],capture_output=True).returncode==0:
    paths=subprocess.check_output(['git','-C',str(repo),'ls-tree','-r','--name-only',ref],text=True).splitlines()
    paths=[p for p in paths if p.endswith('.json') and p.startswith(('src/','v3/'))]
    for path in paths:
        try:
            data=json.loads(subprocess.check_output(['git','-C',str(repo),'show',f'{ref}:{path}']))
            if not all(k in data for k in ('vendorId','productId','matrix','layouts')):continue
            key=f'{int(data["vendorId"],0):04x}-{int(data["productId"],0):04x}'
            version='v3' if path.startswith('v3/') else 'v2'
            filename=f'{key}-{version}.json'
            (out/filename).write_text(json.dumps(data))
            entries.setdefault(key,{})[version]={'name':data['name'],'file':filename,'source':path}
        except (ValueError,KeyError,TypeError):continue
for file in (root/'src/lib/keyboard').glob('*-via.json'):
    data=json.loads(file.read_text());key=f'{int(data["vendorId"],0):04x}-{int(data["productId"],0):04x}'
    # Preserve legacy definitions for older protocols when available upstream.
    filename=f'{key}-v3.json';(out/filename).write_text(json.dumps(data));entries.setdefault(key,{})['v3']={'name':data['name'],'file':filename,'source':str(file.relative_to(root))}
(out/'index.json').write_text(json.dumps({'schemaVersion':1,'boards':entries}))
print(f'Built VIA catalog: {len(entries)} boards')
