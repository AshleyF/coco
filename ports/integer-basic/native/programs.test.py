"""Stored-program milestone projection of the unchanged portable oracle."""
from pathlib import Path
import subprocess
import sys

root = Path(__file__).resolve().parents[1]
ids = [
    'edit-replace-delete-and-list', 'list-range-boundaries',
    'del-range-keeps-neighbors', 'replace-shrink-grow-keeps-neighbors',
    'remark-does-not-execute-embedded-tokens', 'print-separators-and-tab',
    'list-tab-token-and-execute', 'repeated-run-clears-variables-and-run-line',
    'syntax-error-keeps-existing-program',
    'false-if-has-no-side-effect', 'goto-if-line-and-unexecuted-statements',
    'branch-goto-retains-run-clears-scalars',
    'branch-backward-forward-skips-colon-tail',
    'branch-false-if-keeps-colon-tail',
    'branch-false-if-validates-without-evaluation',
    'branch-missing-target-repair-and-state',
    'branch-then-line-requires-literal', 'branch-nested-if-consequent',
    'branch-if-end-and-empty-consequent',
]
ids += [f'long-program-line-{n}' for n in [1, 31, 32, 63, 64, 95, 100]]
ids += [f'multiline-token-boundary-{n}' for n in range(1, 101)]
command = [sys.executable, 'oracle/behavior.py', 'compare',
           '--runner', 'node native/runner.mjs', '--report', 'build/native-programs.json']
for case in ids:
    command += ['--case', case]
sys.exit(subprocess.call(command, cwd=root))
