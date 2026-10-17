import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {createRunner,readSymbols,runCLI} from './console-runner.mjs';
export const symbols=readSymbols(readFileSync(new URL('../build/graphics.sym',import.meta.url),'utf8'));
export const runNative=createRunner(readFileSync(new URL('../build/graphics.bin',import.meta.url)),symbols);
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)runCLI(runNative);
