import {build} from 'esbuild';
import {mkdir,readFile,writeFile} from 'node:fs/promises';

const result=await build({entryPoints:['demo.js'],bundle:true,write:false,platform:'browser',format:'iife',loader:{'.css':'empty'},minify:true});
const css=await readFile('style.css','utf8');
const script=result.outputFiles[0].text.replaceAll('</script','<\\/script');
const html=`<!doctype html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Base gastronómica · Demostración</title><style>${css}</style></head><body><div id="demo"></div><script>${script}</script></body></html>`;
await mkdir('dist',{recursive:true});
await writeFile('dist/demo-standalone.html',html);
console.log('Demostración autónoma: dist/demo-standalone.html');
