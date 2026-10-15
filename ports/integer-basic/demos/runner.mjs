// Historical games need a larger instruction allowance than small unit cases.
import {readFileSync} from 'node:fs';
import {runNative} from '../native/runner.mjs';
const result = runNative(readFileSync(0, 'utf8'), {budget:100_000_000});
process.stdout.write(result.output);
process.exitCode = result.status;
