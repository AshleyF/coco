"""Deterministic transcript corpus, frozen ROM observations, and coverage.

record explicitly replaces the selected golden file; compare never rewrites it.
An alternative runner accepts the same stdin and returns a text transcript.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import random
import re
import shlex
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[1]
ROM = ROOT / 'reference/a1basic.bin'
BUDGET = 2000000


def corpus(count, seed):
    examples = [
        ('prompt', ''), ('hello', 'PRINT "HELLO WORLD"\n'),
        ('precedence', 'PRINT 2+3*4\nPRINT (2+3)*4\n'),
        ('negative', 'PRINT -7/2\nPRINT -32767\n'),
        ('overflow', 'PRINT 32767+1\nPRINT 1/0\n'),
        ('variables', 'A=42\nPRINT A\nCLR\nPRINT A\n'),
        ('loop', '10 FOR I=1 TO 3\n20 PRINT I\n30 NEXT I\n40 END\nRUN\n'),
        ('descending', '10 FOR I=3 TO 1 STEP -1\n20 PRINT I\n30 NEXT I\n40 END\nRUN\n'),
        ('gosub', '10 GOSUB 100\n20 END\n100 PRINT 9\n110 RETURN\nRUN\n'),
        ('input', '10 INPUT A\n20 PRINT A*2\n30 END\nRUN\n21\n'),
        ('string', 'DIM A$(20)\nA$="HELLO"\nPRINT A$\nPRINT LEN(A$)\n'),
        ('array', 'DIM A(5)\nA(2)=17\nPRINT A(2)\n'),
        ('editing', '10 PRINT 7\n10 PRINT 8\n20 END\nLIST\nRUN\n10\nLIST\nNEW\nLIST\n'),
        ('if', '10 IF 1 THEN 30\n20 PRINT 0\n30 PRINT 1\n40 END\nRUN\n'),
        ('errors', 'NEXT I\nRETURN\nGOTO 999\nPRINT (\nBOGUS\n'),
        ('remarks', '10 REM HELLO\n20 PRINT 42\n30 END\nLIST\nRUN\n'),
        ('functions', 'PRINT ABS(-7)\nPRINT SGN(-3)\nPRINT RND(10)\n'),
        ('separators', 'PRINT 1,2;3\n'),
        ('bounds', 'DIM A(2)\nPRINT A(10)\n'),
        ('runaway', '10 GOTO 10\nRUN\n'),
    ]
    examples.extend([
        ('list-ranges', '10 PRINT 10\n20 PRINT 20\n30 END\nLIST 20\nLIST 10,20\nLIST 15,25\nLIST 999\nDEL 10,20\nLIST\nDEL 30\nLIST\n'),
        ('auto', 'AUTO 100,5\nPRINT 1\nPRINT 2\n\x04\nLIST\nAUTO 32767,1\nPRINT 3\n\x04\n'),
        ('editing-controls', 'PRINT 12_3\n\x1bPRINT 7\n' + 'A'*140 + '\n'),
        ('string-input', 'DIM A$(20),B$(20)\nINPUT A$,B$\nHELLO\nWORLD\nPRINT A$;B$\nINPUT "VALUE",A$\nYES\nPRINT A$\n'),
        ('string-substrings', 'DIM A$(20)\nA$="ABCDE"\nPRINT A$(2,4)\nA$(2)="XY"\nPRINT A$\nPRINT A$(0)\nPRINT A$(8,2)\n'),
        ('string-errors', 'DIM A$(2)\nA$="TOOLONG"\nPRINT A$(3)\nDIM B$(0)\n'),
        ('logic', 'PRINT 1 AND 2\nPRINT -1 OR 0\nPRINT NOT 0\nPRINT NOT 3\nPRINT 7 MOD 3\nPRINT -7 MOD 3\n'),
        ('tab', 'PRINT TAB(5);1\nPRINT TAB(0);2\nPRINT TAB(256)\n'),
        ('conditional-inline', 'IF 1 THEN PRINT 7\nIF 0 THEN PRINT 8\n10 IF 1 THEN PRINT 9:PRINT 10\n20 END\nRUN\n'),
        ('program-end-error', '10 PRINT 1\nRUN\n'),
        ('nest-gosub', '10 GOSUB 10\nRUN\n'),
        ('nest-for', ''.join(f'{10+i*10} FOR A{i}=1 TO 2\n' for i in range(10)) + '200 END\nRUN\n'),
        ('memory-limit', 'HIMEM=4000\nLOMEM=2100\n10 PRINT 3\n20 END\nRUN\nHIMEM=4100\nLIST\nLOMEM=5000\n'),
        ('peek-poke', 'POKE 768,42\nPRINT PEEK(768)\nPOKE 769,256\nPOKE 769,-1\n'),
        ('call-return', 'POKE 768,96\nCALL 768\nPRINT 42\n'),
        ('plot-parameters', 'PLOT 1,1\nPLOT 40,1\nPLOT 1,48\nCOLOR=1\nCOLOR=256\n'),
        ('long-list', '10 PRINT "' + 'X'*100 + '"\n20 END\nLIST\nRUN\n'),
        ('syntax-depth', 'PRINT ' + '('*35 + '1' + ')'*35 + '\n'),
        ('out-of-memory', 'DIM A(2000)\nDIM A$(3000)\n'),
        ('program-fill', ''.join(f'{i} REM ' + 'X'*60 + '\n' for i in range(1,45)) + 'LIST\n'),
    ])
    examples.extend([
        ('valid-string-input', '10 DIM A$(20),B$(20)\n20 INPUT A$,B$\n30 PRINT A$;B$\n40 INPUT "VALUE",A$\n50 PRINT A$\n60 END\nRUN\nHELLO\nWORLD\nYES\n'),
        ('valid-tab', 'TAB 5\nTAB 0\nTAB 256\nPRINT "A","B"\n'),
        ('for-exit', '10 FOR I=1 TO 2\n20 FOR J=1 TO 2\n30 PRINT I,J\n40 NEXT I\n50 END\nRUN\n'),
        ('negative-step', '10 FOR I=3 TO -3 STEP -2\n20 PRINT I\n30 NEXT I\n40 END\nRUN\n'),
        ('large-array', 'DIM A(250)\nA(249)=42\nPRINT A(249)\n'),
        ('large-expression', 'PRINT '+ '+'.join('1' for _ in range(45))+'\n'),
        ('string-memory', 'HIMEM=2080\nDIM A$(100)\n'),
        ('line-memory', 'HIMEM=2100\n10 PRINT 1\n20 PRINT 2\n30 PRINT 3\n'),
        ('restart-line', '10 PRINT 1\n20 PRINT 2\n30 END\nRUN 20\n'),
    ])
    examples.extend([
        ('input-retry', '10 INPUT A,B\n20 PRINT A,B\n30 END\nRUN\nBOGUS\n-7,8\n'),
        ('dimension-conflict', 'DIM A(5)\nDIM A$(5)\nA=3\nDIM A(6)\n'),
        ('variable-exhaustion', 'HIMEM=2060\nA=1\nB=2\nC=3\nD=4\n'),
        ('string-end-substring', 'DIM A$(10)\nA$="ABC"\nA$(1,3)="XY"\nPRINT A$\n'),
        ('array-low-byte-wrap', 'DIM A(20)\nDIM B(80)\nB(70)=42\nPRINT B(70)\n'),
        ('negative-logic', 'PRINT (-1) OR (-1)\nPRINT (-1) AND (-1)\n'),
    ])
    for width in range(1,101):
        examples.append((f'program-page-boundary-{width}', '10 PRINT "'+'X'*width+'":A=2:PRINT A+3\n20 END\nRUN\n'))
    for depth in [15,20,25,30,35,40]:
        examples.append((f'operand-depth-{depth}', 'PRINT '+'ABS('*depth+'1'+')'*depth+'\n'))
    examples.append(('variable-no-room', 'HIMEM=2051\nA=1\n'))
    for width in range(1,101):
        source = '10 PRINT 1:PRINT 2:PRINT 3:PRINT 4:PRINT 5:PRINT 6:PRINT 7:PRINT 8:PRINT 9:PRINT 10\n'
        source += '20 REM ' + 'X'*width + '\n'
        source += '30 REM ' + 'Y'*100 + '\n40 REM ' + 'Z'*100 + '\n50 END\nRUN\n'
        examples.append((f'multipage-program-{width}', source))
    for size in range(1,6):
        examples.append((f'exact-substring-{size}', f'DIM A$({size})\nA$="'+'X'*size+f'"\nA$(1,{size})="Y"\nPRINT A$\n'))
    examples.extend([
        ('lowmem-variable-room', 'LOMEM=4092\nA=1\nB=2\n'),
        ('substring-full-read', 'DIM A$(5)\nA$="ABCDE"\nPRINT A$(1,5)\n'),
        ('noun-stack-stress', 'PRINT ' + 'NOT '*31 + '0\n'),
    ])
    for low in range(256):
        examples.append((f'array-pointer-boundary-{low}', f'LOMEM={2048+low}\nDIM A(3)\nA(1)=42\nPRINT A(1)\n'))
    examples.append(('list-complex-tokens', '10 DIM A$(20),B$(20),C(5)\n20 IF A$#B$ THEN PRINT ABS(C(1)),RND(10)\n30 INPUT "VALUE",A$,C(1)\n40 END\nLIST\n'))
    for length in [15,16,17,18,20,30]:
        examples.append((f'skipped-print-stack-{length}', 'IF 0 THEN PRINT '+','.join(['1']*length)+'\n'))
    for left in ['""', '"A"', '"ABC"', '"ABD"', '"AB"']:
        for right in ['""', '"A"', '"ABC"', '"ABD"', '"AB"']:
            examples.append((f'string-compare-{len(examples)}', f'DIM A$(20),B$(20)\nA$={left}\nB$={right}\nIF A$=B$ THEN PRINT 1\nIF A$#B$ THEN PRINT 2\n'))
    for value in [0,1,2,255,256,32767,-1,-32767]:
        examples.append((f'numeric-fns-{value}', f'PRINT ABS({value})\nPRINT SGN({value})\nPRINT RND({value})\nPRINT TAB({value})\n'))
    for name, source in examples:
        yield {'id': name, 'input': source, 'budget': BUDGET}
    rng = random.Random(seed)
    values = [-32767, -256, -1, 0, 1, 2, 127, 255, 256, 32767]
    for n in range(count):
        a, b, c = [rng.choice(values) if rng.randrange(2) else rng.randint(-300, 300) for _ in range(3)]
        op = rng.choice(['+', '-', '*', '/', '=', '#', '<', '>', '<=', '>='])
        source = f'PRINT ({a}){op}({b})\n'
        if n % 4 == 0:
            source = f'A={a}\nB={b}\nPRINT A{op}B\n'
        elif n % 4 == 1:
            source = f'PRINT (({a})+({b}))*({c})\n'
        elif n % 4 == 2:
            source = f'10 A={a}\n20 PRINT A{op}({b})\n30 END\nLIST\nRUN\n'
        yield {'id': f'generated-{n:06}', 'input': source, 'budget': BUDGET}


def execute(case, runner, coverage=None, rom=None):
    env = os.environ.copy()
    env.pop('APPLE1_COVERAGE', None)
    env.pop('BASIC_KEY_AFTER_OUTPUT', None)
    env.pop('BASIC_KEY_BYTE', None)
    if case.get('event'):
        event = case['event']
        if not event['after'] or len(event['after'].encode('ascii')) >= 256 or not 1 <= event['key'] <= 127:
            raise ValueError('key events require a nonempty ASCII anchor below 256 bytes and an ASCII key 1..127')
        env['BASIC_KEY_AFTER_OUTPUT'] = event['after']
        env['BASIC_KEY_BYTE'] = str(event['key'])
    if coverage:
        env['APPLE1_COVERAGE'] = str(coverage)
    # Only default Apple runner receives ROM/budget args; adapters get stdin.
    command = shlex.split(runner) if runner else [str(ROOT / 'build/apple1'), str(rom or ROM), str(case['budget'])]
    try:
        result = subprocess.run(command, input=case['input'], text=True, capture_output=True,
                                timeout=15, env=env)
    except subprocess.TimeoutExpired as error:
        raise RuntimeError(f"{case['id']}: runner exceeded 15-second wall-clock limit") from error
    except OSError as error:
        raise RuntimeError(f"{case['id']}: could not launch runner: {error}") from error
    if result.returncode not in (0, 2):
        raise RuntimeError(f"{case['id']}: runner failed: {result.stderr}")
    return {'output': result.stdout, 'status': result.returncode}


def instruction_map():
    # ca65 listing distinguishes emitted instructions from tables/padding.
    instructions = {}
    pattern = re.compile(r'^([0-9A-F]{6})\s+\d\s+((?:[0-9A-F]{2} ){1,3})\s+(.+)$')
    for line in (ROOT / 'build/a1basic.lst').read_text().splitlines():
        match = pattern.match(line)
        if not match:
            continue
        address = int(match[1], 16)
        source = match[3].split(';')[0].strip()
        source = re.sub(r'^\w+:\s*', '', source)
        if 0xe000 <= address < 0xf000 and source and not source.startswith('.'):
            instructions[address] = source
    return instructions


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('mode', choices=['record', 'compare'])
    parser.add_argument('--golden', type=Path, default=ROOT / 'oracle/golden.jsonl')
    parser.add_argument('--count', type=int, default=1000)
    parser.add_argument('--seed', type=int, default=6809)
    parser.add_argument('--runner', help='alternative transcript runner command (compare only)')
    args = parser.parse_args()
    if args.count < 0 or args.runner and args.mode != 'compare':
        parser.error('invalid count or runner mode')
    digest = hashlib.sha256(ROM.read_bytes()).hexdigest()
    if args.mode == 'compare':
        rows = [json.loads(line) for line in args.golden.read_text().splitlines()]
        metadata, cases = rows[0], rows[1:]
        if metadata['rom_sha256'] != digest:
            raise RuntimeError('ROM fingerprint changed; golden corpus belongs to another image')
    else:
        metadata = {'schema': 1, 'rom_sha256': digest, 'seed': args.seed,
                    'generated_count': args.count, 'core_commit': '66bdc4702a7216cbfebdd0d4a4ca67f362547cfc',
                    'normalization': 'CR display -> LF; exact output including echo/prompts'}
        cases = list(corpus(args.count, args.seed))
    hits, reads = [0] * 4096, [0] * 4096
    failures = []
    with tempfile.TemporaryDirectory() as temp:
        for index, case in enumerate(cases):
            coverage = Path(temp) / 'coverage.json' if not args.runner else None
            observed = execute(case, args.runner, coverage)
            if args.mode == 'record':
                case.update(observed)
            elif any(case[key] != observed[key] for key in observed):
                failures.append(case['id'])
            if coverage:
                trace = json.loads(coverage.read_text())
                hits = [a + b for a, b in zip(hits, trace['hits'])]
                reads = [a + b for a, b in zip(reads, trace['reads'])]
            if (index + 1) % 250 == 0:
                print(f'{index + 1}/{len(cases)} transcripts', flush=True)
    if args.mode == 'record':
        # Write only after the entire collection succeeds.
        args.golden.write_text('\n'.join(json.dumps(row, sort_keys=True) for row in [metadata] + cases) + '\n')
    if not args.runner:
        mapping = instruction_map()
        covered = sum(hits[address - 0xe000] > 0 for address in mapping)
        report = {'cases': len(cases), 'instruction_entries': len(mapping),
                  'executed_entries': covered, 'instruction_coverage_percent': round(100 * covered / len(mapping), 2),
                  'rom_bytes_read': sum(value > 0 for value in reads),
                  'uncovered': [{'address': f'{address:04X}', 'instruction': source}
                                for address, source in mapping.items() if not hits[address - 0xe000]],
                  'unexpected_execution_addresses': [f'{0xe000 + i:04X}' for i, value in enumerate(hits)
                                                     if value and 0xe000 + i not in mapping],
                  'hits': hits, 'reads': reads}
        (ROOT / 'build/coverage.json').write_text(json.dumps(report, indent=2) + '\n')
        print(f'{covered}/{len(mapping)} instruction entries executed ({report["instruction_coverage_percent"]}%)')
    print(f'{len(cases)} transcripts; {len(failures)} mismatches')
    if failures:
        print('Mismatches:', ', '.join(failures[:20]))
        raise SystemExit(1)

if __name__ == '__main__':
    main()
