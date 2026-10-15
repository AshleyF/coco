"""Audited language contracts: independent assertions plus frozen transcripts.

No Apple-address PEEK/POKE/CALL, timing budgets, or emulator RAM layout belongs
in this portable suite. Coverage is measured only after semantic assertions pass.
"""
import argparse
import difflib
import hashlib
import json
from pathlib import Path
import random
import re
import tempfile
from golden import ROOT, ROM, execute, instruction_map

GOLDEN = ROOT / 'oracle/behavior.jsonl'


def cases():
    def case(name, feature, source, numbers=(), errors=(), contains=(), absent=(), event=None):
        result = {'id': name, 'feature': feature, 'intent': name.replace('-', ' '),
                'input': source + 'PRINT "DONE!"\n', 'budget': 10000000,
                'expect': {'numbers': list(map(str, numbers)), 'errors': list(errors),
                           'contains': list(contains) + ['\nDONE!\n'],
                           'absent': list(absent), 'status': 0}}
        if event is not None:
            result['event'] = event
        return result
    yield case('precedence-and-parentheses', 'arithmetic', 'PRINT 2+3*4\nPRINT (2+3)*4\nPRINT 20/3\nPRINT -20/3\n', [14,20,6,-6])
    yield case('arithmetic-errors-recover', 'errors', 'PRINT 32767+1\nPRINT 1/0\nPRINT 7\n', [7], ['>32767','>32767'])
    yield case('store-overwrite-and-clr', 'variables', 'A=7\nB=3\nPRINT A+B\nA=-2\nPRINT A\nCLR\nPRINT A\nPRINT B\nA=9\nPRINT A\n', [10,-2,0,0,9])
    yield case('array-distinct-indices', 'arrays', 'DIM A(5)\nA(1)=11\nA(2)=22\nA(5)=33\nPRINT A(1)\nPRINT A(2)\nPRINT A(5)\n', [11,22,33])
    yield case('array-range-and-recovery', 'errors', 'DIM A(2)\nA(1)=17\nPRINT A(3)\nPRINT A(1)\n', [17], ['RANGE'])
    yield case('string-store-slice-length', 'strings', 'DIM A$(20)\nA$="ABCDE"\nPRINT A$\nPRINT A$(2,4)\nPRINT LEN(A$)\nA$(2)="XY"\nPRINT A$\n', [5], contains=['\nABCDE\n','\nBCD\n','\nAXY\n'])
    yield case('string-overflow-recovery', 'errors', 'DIM A$(2)\nA$="LONG"\nPRINT 7\n', [7], ['STR OVFL'])
    yield case('ascending-for-state', 'control', '10 FOR I=1 TO 3\n20 PRINT I\n30 NEXT I\n40 END\nRUN\nPRINT I\n', [1,2,3,4])
    yield case('descending-for-state', 'control', '10 FOR I=3 TO -3 STEP -2\n20 PRINT I\n30 NEXT I\n40 END\nRUN\nPRINT I\n', [3,1,-1,-3,-5])
    yield case('nested-for-order', 'control', '10 FOR I=1 TO 2\n20 FOR J=1 TO 2\n30 PRINT I*10+J\n40 NEXT J\n50 NEXT I\n60 END\nRUN\n', [11,12,21,22])
    yield case('nested-gosub-return-order', 'control', '10 GOSUB 100\n20 PRINT 3\n30 END\n100 PRINT 1\n110 GOSUB 200\n120 RETURN\n200 PRINT 2\n210 RETURN\nRUN\n', [1,2,3])
    yield case('false-if-has-no-side-effect', 'control', '10 A=7\n20 IF 0 THEN LET A=99\n30 PRINT A\n40 IF 1 THEN LET A=9\n50 PRINT A\n60 END\nRUN\n', [7,9])
    yield case('input-numeric-stores-values', 'input', '10 INPUT A,B\n20 PRINT A\n30 PRINT B\n40 END\nRUN\n-7,8\nPRINT A+B\n', [-7,8,1])
    yield case('input-retry-and-recovery', 'input', '10 INPUT A\n20 PRINT A\n30 END\nRUN\nBOGUS\n12\n', [12], ['SYNTAX'], contains=['RETYPE LINE'])
    yield case('input-string-and-prompt', 'input', '10 DIM A$(20)\n20 INPUT "VALUE",A$\n30 PRINT A$\n40 END\nRUN\nHELLO\n', contains=['VALUE?HELLO','\nHELLO\n'])
    yield case('edit-replace-delete-and-list', 'editing', '10 PRINT 7\n20 PRINT 2\n30 END\n10 PRINT 8\nLIST\nRUN\n20\nLIST\nRUN\nSCR\nLIST\n', [8,2,8], contains=['   10 PRINT 8\n','   20 PRINT 2\n'], absent=['   10 PRINT 7\n'])
    yield case('list-range-boundaries', 'editing', '10 PRINT 1\n20 PRINT 2\n30 END\nLIST 15,25\nDEL 10,20\nLIST\nRUN\n', contains=['   20 PRINT 2\n','   30 END \n'], absent=['   10 PRINT 1\n'])
    yield case('missing-line-and-return-errors', 'errors', 'GOTO 999\n10 RETURN\n20 END\nRUN\nPRINT 17\n', [17], ['BAD BRANCH','BAD RETURN'])
    yield case('syntax-errors-recover', 'errors', 'BOGUS\nPRINT (\nPRINT 23\n', [23], ['SYNTAX','SYNTAX'])
    yield case('print-separators-and-tab', 'console', 'PRINT 1;2\nPRINT "A","B"\n10 TAB 5:PRINT "X"\n20 END\nRUN\n', [12], contains=['A       B','\n    X\n'])
    yield case('empty-string-and-compare', 'strings', 'DIM A$(10),B$(10)\nA$=""\nB$=""\nIF A$=B$ THEN PRINT 1\nB$="A"\nIF A$#B$ THEN PRINT 2\n', [1,2])
    random_case=case('random-range-and-sequence', 'random', 'PRINT RND(10)\n'*10)
    random_case['expect']['numbers']=None
    random_case['expect']['range']=[0,9,10]
    random_case['expect']['minimum_distinct']=3
    yield random_case
    yield case('integer-boundary-carry-borrow', 'arithmetic', 'PRINT 255+1\nPRINT 256-1\nPRINT 32766+1\nPRINT -32766-1\nPRINT 32767-32767\nPRINT -32767+32767\n', [256,255,32767,-32767,0,0])
    yield case('del-range-keeps-neighbors', 'editing', '10 PRINT 1\n20 PRINT 2\n30 PRINT 3\n40 END\nDEL 15,25\nLIST\nRUN\n', [1,3], contains=['   10 PRINT 1\n','   30 PRINT 3\n'], absent=['   20 PRINT 2\n'])
    yield case('auto-numbering-and-cancel', 'editing', 'AUTO 100,5\nPRINT 1\nPRINT 2\n\x04\nLIST\nRUN\n', [1,2], ['END'], contains=['  100 PRINT 1\n','  105 PRINT 2\n'])
    for value in [0,1,9,10,99,100,255,256,1000,10000,32767,-1,-10,-256,-32767]:
        yield case(f'literal-console-number-{value}', 'literal-console', f'PRINT {value}\n', [value])
    yield case('literal-console-strings', 'literal-console',
               'PRINT "HELLO WORLD"\nPRINT ""\nPRINT "A,B;C:!?"\n',
               contains=['\nHELLO WORLD\n','\nA,B;C:!?\n'])
    yield case('literal-console-positive-and-leading-zero', 'literal-console',
               'PRINT +7\nPRINT 00042\nPRINT -0\n', [7,42,0])
    yield case('literal-console-errors-and-recovery', 'literal-console',
               'BOGUS\nPRINT (\nPRINT 32768\nPRINT -32768\nPRINT 17\n',
               [17], ['SYNTAX','SYNTAX','>32767','>32767'])
    yield case('literal-console-lowercase', 'literal-console', 'print "hello"\nprint -7\n',
               [-7], contains=['\nHELLO\n'])
    yield case('literal-console-editing', 'literal-console',
               'PRINT 12_3\nPRINT 99\x1bPRINT 7\n', [13,7])
    yield case('literal-console-empty-print-and-line', 'literal-console', '\nPRINT\nPRINT 5\n', [5])
    values = [-32767,-256,-1,0,1,127,256,32767]
    for a in values:
        for b in values:
            for op in ['AND','OR']:
                result = (bool(a) and bool(b)) if op == 'AND' else (bool(a) or bool(b))
                yield case(f'boolean-{a}-{op}-{b}', 'logic', f'PRINT ({a}) {op} ({b})\n', [int(result)])
    for a in [-32767,-1,0,1,32767]:
        yield case(f'abs-sgn-not-{a}', 'arithmetic', f'PRINT ABS({a})\nPRINT SGN({a})\nPRINT NOT ({a})\n', [abs(a),(a>0)-(a<0),int(not a)])
    rng = random.Random(6809)
    for n in range(200):
        a,b = rng.randint(-100,100), rng.randint(-100,100)
        op = rng.choice(['+','-','*','/','#','=','<>','<','>','<=','>='])
        if op == '/' and b == 0: b=1
        result = {'+':lambda:a+b, '-':lambda:a-b, '*':lambda:a*b,
                  '/':lambda:(-1 if (a<0)!=(b<0) else 1)*(abs(a)//abs(b)),
                  '#':lambda:int(a!=b),'<>':lambda:int(a!=b),'=':lambda:int(a==b),
                  '<':lambda:int(a<b),'>':lambda:int(a>b),'<=':lambda:int(a<=b),'>=':lambda:int(a>=b)}[op]()
        expression=f'({a}){op}({b})'
        source=f'PRINT {expression}\nA={a}\nB={b}\nPRINT A{op}B\n'
        yield case(f'computed-expression-{n:03}', 'arithmetic', source, [result,result])
    for width in [1,31,32,63,64,95,100]:
        yield case(f'long-program-line-{width}', 'editing', '10 PRINT "'+'X'*width+'":A=2:PRINT A+3\n20 END\nLIST\nRUN\nPRINT A\n', [5,2], contains=['\n'+'X'*width+'\n'])
    for size in [2,15,127,249]:
        yield case(f'array-boundary-{size}', 'arrays', f'DIM A({size})\nA(1)=3\nA({size})=19\nPRINT A(1)\nPRINT A({size})\n', [3,19])
    from contracts import extended_cases
    yield from extended_cases(case)


def assert_behavior(case, observed):
    expected = case['expect']
    if observed['status'] != expected['status']:
        raise AssertionError(f"{case['id']}: status {observed['status']}, expected {expected['status']}")
    output=observed['output']
    actual = re.findall(r'(?m)^-?\d+$', output)
    if expected['numbers'] is not None and actual != expected['numbers']:
        raise AssertionError(f"{case['id']}: numeric results {actual}, expected {expected['numbers']}")
    if 'range' in expected:
        low,high,count=expected['range']
        if len(actual)!=count or any(not low<=int(value)<=high for value in actual):
            raise AssertionError(f"{case['id']}: out-of-range or missing results {actual}")
        if len(set(actual))<expected.get('minimum_distinct',1):
            raise AssertionError(f"{case['id']}: sequence fails variation check")
    errors=re.findall(r'(?m)^\*\*\* (.*?) ERR$', output)
    if errors != expected['errors']:
        raise AssertionError(f"{case['id']}: errors {errors}, expected {expected['errors']}")
    for text in expected['contains']:
        if text not in output: raise AssertionError(f"{case['id']}: missing {text!r}")
    for text in expected['absent']:
        if text in output: raise AssertionError(f"{case['id']}: forbidden {text!r}")
    if not output.endswith('\n>'):
        raise AssertionError(f"{case['id']}: did not finish at next prompt")


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('mode',choices=['record','compare'])
    parser.add_argument('--runner',help='portable transcript adapter, compare only')
    parser.add_argument('--feature',action='append',help='compare a feature subset; repeatable')
    parser.add_argument('--case',action='append',help='compare an exact case id; repeatable')
    parser.add_argument('--report',type=Path,help='write per-case acceptance results, compare only')
    parser.add_argument('--artifact',type=Path,help='fingerprint an immutable candidate build, compare only')
    args=parser.parse_args()
    if args.runner and args.mode!='compare': parser.error('runner requires compare')
    if (args.feature or args.case) and args.mode!='compare': parser.error('filters require compare')
    if args.report and args.mode!='compare': parser.error('report requires compare')
    if args.artifact and args.mode!='compare': parser.error('artifact requires compare')
    artifact_digest = hashlib.sha256(args.artifact.read_bytes()).hexdigest() if args.artifact else None
    if args.report and args.report.resolve() in {GOLDEN.resolve(), ROM.resolve(), (ROOT/'oracle/golden.jsonl').resolve()}:
        parser.error('acceptance reports cannot overwrite the reference ROM or frozen baselines')
    digest=hashlib.sha256(ROM.read_bytes()).hexdigest()
    if args.mode=='record':
        suite=list(cases())
        metadata={'schema':1,'scope':'portable-language','rom_sha256':digest,'core_commit':'66bdc4702a7216cbfebdd0d4a4ca67f362547cfc','assertions':'independent results + exact frozen transcript','normalization':'display CR -> LF; no whitespace trimming'}
    else:
        golden_bytes = GOLDEN.read_bytes()
        suite_digest = hashlib.sha256(golden_bytes).hexdigest()
        rows=[json.loads(line) for line in golden_bytes.decode().splitlines()]
        metadata,suite=rows[0],rows[1:]
        current=list(cases())
        if len(current)!=len(suite) or any(any(saved.get(key)!=case.get(key) for key in case) for saved,case in zip(suite,current)):
            raise RuntimeError('case definitions changed; explicitly review and re-record the behavioral baseline')
        if metadata['rom_sha256']!=digest: raise RuntimeError('reference fingerprint changed')
    if len({case['id'] for case in suite})!=len(suite):
        raise RuntimeError('duplicate behavioral case ids')
    if args.feature or args.case:
        unknown_ids=set(args.case or [])-{c['id'] for c in suite}
        unknown_features=set(args.feature or [])-{c['feature'] for c in suite}
        if unknown_ids or unknown_features:
            parser.error(f'unknown selectors: {sorted(unknown_ids | unknown_features)}')
        suite=[c for c in suite if (not args.feature or c['feature'] in args.feature)
               and (not args.case or c['id'] in args.case)]
        if not suite: parser.error('no cases match requested filters')
    hits=[0]*4096
    witnesses={}
    branch_witnesses={}
    failures=[]
    case_results=[]
    with tempfile.TemporaryDirectory() as temp:
        for case in suite:
            path=Path(temp)/'coverage.json' if not args.runner else None
            try:
                observed=execute(case,args.runner,path)
                assert_behavior(case,observed)
                if args.mode=='record':case.update(observed)
                elif any(case[key]!=observed[key] for key in ['output','status']):
                    difference=''.join(difflib.unified_diff(case['output'].splitlines(True), observed['output'].splitlines(True), fromfile='golden', tofile='candidate'))
                    raise AssertionError(f"{case['id']}: frozen transcript differs\n{difference[:2000]}")
                if path:
                    coverage=json.loads(path.read_text())
                    trace=coverage['hits']
                    hits=[a+b for a,b in zip(hits,trace)]
                    for i,value in enumerate(trace):
                        if value: witnesses.setdefault(f'{0xe000+i:04X}',[]).append(case['id'])
                    for address,counts in coverage['branches'].items():
                        for outcome,count in zip(['not_taken','taken'],counts):
                            if count:
                                branch_witnesses.setdefault(address,{}).setdefault(outcome,[]).append(case['id'])
                case_results.append({'id':case['id'],'feature':case['feature'],'passed':True})
            except (AssertionError,RuntimeError) as error:
                failures.append(str(error))
                case_results.append({'id':case['id'],'feature':case['feature'],'passed':False,'reason':str(error)})
    if args.artifact and hashlib.sha256(args.artifact.read_bytes()).hexdigest() != artifact_digest:
        raise RuntimeError('candidate artifact changed during comparison; rerun against a stable build')
    if args.report:
        acceptance={'reference_rom_sha256':digest,
                    'suite_sha256':suite_digest,
                    'runner':args.runner or 'original','cases':len(suite),
                    'passed':len(suite)-len(failures),'failed':len(failures),
                    'results':case_results}
        if args.artifact:
            acceptance['candidate_artifact']={'path':str(args.artifact),'sha256':artifact_digest}
        args.report.write_text(json.dumps(acceptance,indent=2)+'\n')
    if failures:
        print('\n'.join(failures[:30]))
        print(f'{len(failures)}/{len(suite)} behavioral contracts failed; golden file untouched')
        raise SystemExit(1)
    if args.mode=='record':
        GOLDEN.write_text('\n'.join(json.dumps(row,sort_keys=True) for row in [metadata]+suite)+'\n')
        suite_digest = hashlib.sha256(GOLDEN.read_bytes()).hexdigest()
    if not args.runner and not (args.feature or args.case):
        mapping=instruction_map()
        covered=sum(hits[a-0xe000]>0 for a in mapping)
        report={'suite':'portable-language','rom_sha256':digest,
                'suite_sha256':suite_digest,
                'cases':len(suite),'executed_entries':covered,'instruction_entries':len(mapping),'instruction_coverage_percent':round(100*covered/len(mapping),2),'uncovered':[f'{a:04X}' for a in mapping if not hits[a-0xe000]],'case_witnesses':witnesses}
        branch_names={'BPL','BMI','BVC','BVS','BCC','BCS','BNE','BEQ'}
        branch_addresses=[f'{a:04X}' for a,source in mapping.items() if source.split()[0] in branch_names]
        outcomes=sum(len(branch_witnesses.get(a,{})) for a in branch_addresses)
        report['branch_coverage']={'observed_outcomes':outcomes,'possible_outcomes':2*len(branch_addresses),
            'percent':round(100*outcomes/(2*len(branch_addresses)),2),
            'missing':[{'address':a,'outcome':o} for a in branch_addresses for o in ['not_taken','taken'] if o not in branch_witnesses.get(a,{})],
            'case_witnesses':branch_witnesses}
        report['features']={feature:{'cases':sum(c['feature']==feature for c in suite),
            'executed_entries':sum(any(case_id in feature_ids for case_id in witnesses.get(f'{a:04X}',[])) for a in mapping)}
            for feature in sorted({c['feature'] for c in suite})
            for feature_ids in [{c['id'] for c in suite if c['feature']==feature}]}
        (ROOT/'build/behavior-coverage.json').write_text(json.dumps(report,indent=2)+'\n')
        print(f'Behavioral coverage: {covered}/{len(mapping)} ({report["instruction_coverage_percent"]}%)')
        print(f'Branch outcomes: {outcomes}/{2*len(branch_addresses)} ({report["branch_coverage"]["percent"]}%)')
    print(f'{len(suite)} behavioral contracts passed')

if __name__=='__main__':main()
