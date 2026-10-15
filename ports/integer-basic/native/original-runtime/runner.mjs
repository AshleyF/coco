// Native binary adapter; no host BASIC parsing or execution.
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {createRunner,readSymbols,runCLI} from '../console-runner.mjs';
const binary=readFileSync(new URL('../../build/runtime-prototype.bin',import.meta.url));
export const symbols=readSymbols(readFileSync(new URL('../../build/runtime-prototype.sym',import.meta.url),'utf8'));
export const runNative=createRunner(binary,symbols);
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)runCLI(runNative);
