import {readFileSync} from 'node:fs';
import {createRunner,readSymbols} from './console-runner.mjs';
export const symbols=readSymbols(readFileSync(new URL('../build/graphics64.sym',import.meta.url),'utf8'));
export const runNative=createRunner(readFileSync(new URL('../build/graphics64.bin',import.meta.url)),symbols);
import {pathToFileURL} from 'node:url';
import {runCLI} from './console-runner.mjs';
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)
 runCLI((source,options)=>runNative(source,{...options,budget:1_000_000_000}));
