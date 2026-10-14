"""Smoke coverage for real assembled Apple-1 BASIC and bounded execution."""
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[1]
EXE = ROOT / 'build/apple1'
ROM = ROOT / 'build/a1basic.bin'

def run(commands, budget=100000000):
    return subprocess.run([str(EXE), str(ROM), str(budget)], input=commands,
                          text=True, capture_output=True, timeout=10)

def check(commands, expected):
    result = run(commands)
    assert result.returncode == 0, result.stderr
    assert expected in result.stdout, repr(result.stdout)

check('PRINT 6*7\n', '\n42\n')
check('PRINT 2+3*4\nPRINT -7/2\n', '\n14\n\n>PRINT -7/2\n-3\n')
check('10 FOR I=1 TO 3\n20 PRINT I\n30 NEXT I\n40 END\nRUN\n',
      '>RUN\n1\n2\n3\n\n>')
check('10 PRINT 7\n10 PRINT 8\n20 END\nLIST\nRUN\n',
      '>RUN\n8\n\n>')
check('10 GOSUB 100\n20 END\n100 PRINT 9\n110 RETURN\nRUN\n',
      '>RUN\n9\n\n>')
check('PRINT 1/0\n', '*** >32767 ERR\n')
check('print "hello"\n', '\nHELLO\n')
result = run('10 GOTO 10\nRUN\n', 100000)
assert result.returncode == 2 and 'budget exhausted' in result.stderr, result
# EOF only succeeds at the next blocking read, not mid-program.
result = run('PRINT 42\n')
assert result.stdout.endswith('\n>'), repr(result.stdout)
print('9 Apple-1 BASIC console checks passed')
