// Generate protocol-specific keycode data from the pinned VIA app checkout (GPL-3.0).
const fs=require('fs'),path=require('path');
const root=path.resolve(__dirname,'..'),via=path.resolve(root,'../via-app-code');
const esbuild=require(path.join(via,'node_modules/esbuild'));
const output=path.join(root,'src/lib/via/generated');fs.mkdirSync(output,{recursive:true});
const key=path.join(via,'src/utils/key'),dict=path.join(via,'src/utils/key-to-byte/dictionary-store');
const code=`export {getKeycodes,getOtherMenu,getByteForCode} from ${JSON.stringify(key)}; export {getBasicKeyDict} from ${JSON.stringify(dict)};`;
const built=esbuild.buildSync({stdin:{contents:code,resolveDir:via,loader:'ts'},bundle:true,platform:'node',format:'cjs',write:false});
const mod={exports:{}};new Function('module','exports','require',built.outputFiles[0].text)(mod,mod.exports,require);const api=mod.exports;
const catalog={};for(const version of [8,9,10,11,12,13]){const dict=api.getBasicKeyDict(version);catalog[version]={dict,categories:[...api.getKeycodes(128),api.getOtherMenu(dict)].map(g=>({...g,keycodes:g.keycodes.filter(k=>!['text','container'].includes(k.type)).map(k=>{let value;try{value=api.getByteForCode(k.code,dict)}catch{}return {...k,value}}).filter(k=>Number.isInteger(k.value)&&k.value>=0&&k.value<=65535)}))}}
fs.writeFileSync(path.join(output,'keycodes.json'),JSON.stringify(catalog));
esbuild.buildSync({stdin:{contents:`export {getByteForCode} from ${JSON.stringify(key)}`,resolveDir:via,loader:'ts'},bundle:true,platform:'browser',format:'esm',minify:true,outfile:path.join(output,'parser.js')});
fs.writeFileSync(path.join(output,'NOTICE.md'),'Generated from the local VIA app key tables and expression parser. GPL-3.0. Source: https://github.com/the-via/app . Regenerate with node scripts/build-via-keycodes.cjs. Preserve upstream license.\n');
fs.copyFileSync(path.join(via,'LICENSE'),path.join(output,'LICENSE'));
