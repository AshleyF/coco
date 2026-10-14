"""Directed, portable partitions and persistent-state BASIC scenarios.

Expected results are stated before recording. Original-specific semantics are
identified explicitly; frozen observations alone are not independent validation.
"""


def extended_cases(case):
    yield case('branch-if-end-and-empty-consequent', 'errors',
               'IF 1 THEN END\n10 IF 0 THEN END:PRINT 7:END\nRUN\n'
               '10 IF 0 THEN END:END\nRUN\nIF 0 THEN\nPRINT 17\n',
               [7,17], ['SYNTAX'])
    yield case('branch-goto-retains-run-clears-scalars', 'control',
               '10 A=A+1\n20 PRINT A\n30 END\nA=7\nGOTO 10\nPRINT A\n'
               'RUN 10\nPRINT A\n', [8,8,1,1])
    yield case('branch-backward-forward-skips-colon-tail', 'control',
               '10 A=0\n20 A=A+1\n30 IF A<3 THEN 20:PRINT A\n'
               '40 GOTO 60:PRINT 999\n50 PRINT 888\n60 END\nLIST\nRUN\n', [3])
    yield case('branch-false-if-keeps-colon-tail', 'control',
               '10 A=7\n20 IF 0 THEN A=99:PRINT 8\n30 PRINT A\n'
               '40 IF 1 THEN PRINT 11:PRINT 12\n50 END\nLIST\nRUN\n', [8,7,11,12])
    yield case('branch-false-if-validates-without-evaluation', 'errors',
               'A=17\nIF 0 THEN PRINT 1/0\nIF 0 THEN 999\n'
               'IF 0 THEN PRINT (\nIF 0 THEN BOGUS\nPRINT A\n', [17], ['SYNTAX','SYNTAX'])
    yield case('branch-missing-target-repair-and-state', 'errors',
               '10 GOTO 999\n20 END\nA=17\nGOTO 999\nPRINT A\n'
               'RUN\nPRINT A\n10 PRINT 42\nRUN\n', [17,0,42],
               ['BAD BRANCH','BAD BRANCH'], contains=['STOPPED AT 10'])
    yield case('branch-then-line-requires-literal', 'errors',
               'A=7\nIF 1 THEN 5+5\nIF 0 THEN (10)\nIF 1 THEN -1\nPRINT A\n',
               [7], ['SYNTAX','SYNTAX','SYNTAX'])
    yield case('branch-nested-if-consequent', 'control',
               '10 IF 1 THEN IF 0 THEN PRINT 99:PRINT 8\n'
               '20 IF 1 THEN IF 1 THEN PRINT 7\n30 END\nRUN\n', [8,7])
    comparisons = {'=': lambda a,b: a == b, '#': lambda a,b: a != b,
                   '<>': lambda a,b: a != b, '<': lambda a,b: a < b,
                   '>': lambda a,b: a > b, '<=': lambda a,b: a <= b,
                   '>=': lambda a,b: a >= b}
    # All order partitions, signs, and low-byte boundaries. Differences remain
    # representable: the original compares by subtraction and can overflow.
    pairs = [(a,b) for a in [-256,-1,0,1,256] for b in [-256,-1,0,1,256]]
    pairs += [(32767,32767),(-32767,-32767),(32766,32767),(-32767,-32766)]
    for op, predicate in comparisons.items():
        for n,(a,b) in enumerate(pairs):
            result = int(predicate(a,b))
            yield case(f'comparison-{op}-{n:02}', 'comparison',
                       f'PRINT ({a}){op}({b})\nA={a}\nB={b}\nPRINT A{op}B\n',
                       [result,result])

    strings = ['', 'A', 'B', 'AB', 'AC', 'ABC', 'ABD', 'XBC']
    for i,a in enumerate(strings):
        for j,b in enumerate(strings):
            yield case(f'string-characters-{i}-{j}', 'strings',
                       f'DIM A$(10),B$(10)\nA$="{a}"\nB$="{b}"\n'
                       'IF A$=B$ THEN PRINT 1\nIF A$#B$ THEN PRINT 2\n',
                       [1 if a == b else 2])
    yield case('string-input-compares-characters', 'input',
               '10 DIM A$(10),B$(10)\n20 INPUT A$,B$\n'
               '30 IF A$=B$ THEN PRINT 1\n40 IF A$#B$ THEN PRINT 2\n'
               '50 END\nRUN\nAB\nAC\n', [2])
    yield case('substring-assignment-compares-result', 'strings',
               'DIM A$(10),B$(10)\nA$="ABCDE"\nB$="ABXY"\n'
               'A$(3)="XY"\nPRINT LEN(A$)\n'
               'IF A$=B$ THEN PRINT 1\nIF A$#B$ THEN PRINT 2\n', [4,1])

    for a in [-32767,-257,-7,-1,0,1,7,257,32767]:
        for b in [-257,-3,-1,1,3,257]:
            quotient = (-1 if (a<0)!=(b<0) else 1)*(abs(a)//abs(b))
            # This image gives MOD the product of the operand signs, rather
            # than the dividend sign. Keep this compatibility choice explicit.
            remainder = (-1 if (a<0)!=(b<0) else 1)*(abs(a)%abs(b))
            yield case(f'division-mod-{a}-{b}', 'division',
                       f'PRINT ({a})/({b})\nPRINT ({a}) MOD ({b})\n'
                       f'A={a}\nB={b}\nPRINT A/B\nPRINT A MOD B\n',
                       [quotient,remainder,quotient,remainder])
    yield case('operator-associativity-and-unary', 'arithmetic',
               'PRINT 20-5-3\nPRINT 24/3/2\nPRINT 2*(3+4)\n'
               'PRINT -(2+3)*4\nPRINT +7\nPRINT 7 MOD 3+2\n', [12,4,14,-20,7,3])
    for n,expression in enumerate(['32767+1','-32767-2','32767*2','1/0','7 MOD 0']):
        yield case(f'arithmetic-failure-preserves-state-{n}', 'errors',
                   f'A=17\nB=23\nPRINT {expression}\nPRINT A\nPRINT B\nPRINT A+B\n',
                   [17,23,40], ['>32767'])
    yield case('clr-releases-storage-keeps-program', 'variables',
               'DIM A(2),B$(5)\nA(1)=7\nB$="HI"\nC=9\n'
               '10 PRINT 42\n20 END\nCLR\nPRINT C\n'
               'DIM A(2),B$(5)\nPRINT A(1)\nPRINT LEN(B$)\nLIST\nRUN\n',
               [0,0,0,42], contains=['   10 PRINT 42\n'])
    yield case('separate-live-storage-and-overwrite', 'variables',
               'DIM A(3),B(3),C$(10),D$(10)\nE=37\n'
               'A(1)=11\nB(1)=22\nA(3)=33\nB(3)=44\n'
               'C$="FIRST"\nD$="SECOND"\nC$="X"\n'
               'PRINT A(1)\nPRINT B(1)\nPRINT A(3)\nPRINT B(3)\n'
               'PRINT E\nPRINT C$\nPRINT D$\nPRINT LEN(C$)\nPRINT LEN(D$)\n',
               [11,22,33,44,37,1,6], contains=['\nX\n','\nSECOND\n'])
    yield case('array-error-preserves-other-storage', 'errors',
               'DIM A(2),B(2)\nA(1)=17\nB(2)=23\n'
               'A(3)=99\nPRINT A(1)\nPRINT B(2)\n'
               'A(0)=99\nPRINT A(1)\nPRINT B(2)\n',
               [17,23,17,23], ['RANGE','RANGE'])
    yield case('repeated-run-clears-variables-and-run-line', 'control',
               '10 A=A+1\n20 PRINT A\n30 END\nRUN\nRUN\n'
               'A=7\nRUN 20\nPRINT A\n', [1,1,0,0])
    yield case('goto-if-line-and-unexecuted-statements', 'control',
               '10 A=0\n20 IF 0 THEN 60\n30 A=A+1\n40 GOTO 70\n'
               '50 A=99\n60 A=88\n70 IF A=1 THEN 90\n80 A=77\n'
               '90 PRINT A\n100 END\nRUN\n', [1])
    yield case('remark-does-not-execute-embedded-tokens', 'tokenizer',
               '10 A=7\n20 REM PRINT 99: A=123\n30 PRINT A\n40 END\nLIST\nRUN\n',
               [7], contains=['REM PRINT 99: A=123'])
    yield case('replace-shrink-grow-keeps-neighbors', 'editing',
               '30 PRINT 3\n10 PRINT 1\n20 PRINT 22222\n40 END\nRUN\n'
               '20 PRINT 2\nLIST\nRUN\n20 PRINT 12345:PRINT 6\nRUN\n'
               '20\nRUN\nLIST\n', [1,22222,3,1,2,3,1,12345,6,3,1,3],
               contains=['   10 PRINT 1\n','   30 PRINT 3\n'])
    yield case('syntax-error-keeps-existing-program', 'errors',
               '10 PRINT 42\n20 END\nA=17\nBOGUS\nPRINT A\nLIST\nRUN\n',
               [17,42], ['SYNTAX'], contains=['   10 PRINT 42\n'])
    yield case('keyboard-delete-character', 'editing', 'PRINT 12_3\n', [13])
    for name,start,limit,step,expected in [
            ('single',2,2,1,[2,3]), ('overshoot',1,4,2,[1,3,5]),
            ('descending-overshoot',4,1,-2,[4,2,0]),
            ('initially-beyond-limit',3,1,1,[3,4])]:
        yield case(f'for-boundary-{name}', 'control',
                   f'10 FOR I={start} TO {limit} STEP {step}\n'
                   '20 PRINT I\n30 NEXT I\n40 END\nRUN\nPRINT I\n', expected)
    yield case('next-outer-discards-inner-loop', 'control',
               '10 FOR I=1 TO 2\n20 FOR J=1 TO 2\n30 PRINT I*10+J\n'
               '40 NEXT I\n50 END\nRUN\nPRINT I\nPRINT J\n', [11,21,3,1])
    # Exactly eight active subroutines is a language-level limit, independent
    # of the host's RAM addresses or instruction count.
    for depth in [1,7,8]:
        source='10 GOSUB 100\n20 PRINT 999\n30 END\n'
        for level in range(depth):
            line=100+level*100
            source+=f'{line} PRINT {level+1}\n'
            if level+1<depth: source+=f'{line+10} GOSUB {line+100}\n'
            source+=f'{line+20} PRINT {-level-1}\n{line+30} RETURN\n'
        yield case(f'gosub-depth-{depth}', 'control', source+'RUN\n',
                   list(range(1,depth+1))+list(range(-depth,0))+[999])
    yield case('gosub-limit-and-stack-recovery', 'errors',
               '10 GOSUB 10\n20 END\nRUN\n10 PRINT 42\nRUN\n', [42],
               ['>8 GOSUBS'], contains=['STOPPED AT 10'])
    yield case('for-limit-and-stack-recovery', 'errors',
               ''.join(f'{10+i*10} FOR A{i}=1 TO 1\n' for i in range(9))+
               '100 END\nRUN\nSCR\n10 FOR I=1 TO 1\n20 PRINT I\n'
               '30 NEXT I\n40 END\nRUN\n', [1], ['>8 FORS'],
               contains=['STOPPED AT 90'])
    yield case('bad-next-repair-and-rerun', 'errors',
               '10 NEXT I\n20 END\nRUN\n10 FOR I=1 TO 1\n15 PRINT I\nRUN\n',
               [1], ['BAD NEXT'], contains=['STOPPED AT 10'])
    yield case('substring-boundaries-preserve-source', 'strings',
               'DIM A$(5)\nA$="ABCDE"\nPRINT A$(1,5)\nPRINT A$(5)\n'
               'PRINT A$(0)\nPRINT A$(6)\nPRINT A$(4,2)\nPRINT A$\n',
               errors=['STRING','STRING','STRING'], contains=['\nABCDE\n','\nE\n'])
    yield case('input-empty-string', 'input',
               '10 DIM A$(5)\n20 INPUT A$\n30 PRINT LEN(A$)\n40 END\nRUN\n\n', [0])
    yield case('input-array-elements', 'input',
               '10 DIM A(2)\n20 INPUT A(1),A(2)\n30 PRINT A(1)+A(2)\n'
               '40 END\nRUN\n7,9\nPRINT A(1)\nPRINT A(2)\n', [16,7,9])
    for depth in [1,7,8]:
        source=''.join(f'{10+i*10} FOR A{i}=1 TO 1\n' for i in range(depth))
        source+='100 PRINT 42\n'
        source+=''.join(f'{110+i*10} NEXT A{depth-1-i}\n' for i in range(depth))
        source+='200 END\nRUN\n'
        source+=''.join(f'PRINT A{i}\n' for i in range(depth))
        yield case(f'for-depth-{depth}', 'control', source, [42]+[2]*depth)
    for width in range(1,101):
        # Sweep logical text lengths instead of injecting Apple pointers. This
        # moves token/program boundaries through a page and checks execution,
        # listing, and a subsequent edit/rerun against the same language rules.
        source='10 '+':'.join(f'PRINT {n}' for n in range(1,11))+'\n'
        source+='20 REM '+'X'*width+'\n30 REM '+'Y'*100+'\n40 REM '+'Z'*100+'\n'
        source+='50 END\nLIST\nRUN\n20 PRINT 42\nRUN\n'
        yield case(f'multiline-token-boundary-{width}', 'editing', source,
                   list(range(1,11))*2+[42],
                   contains=['REM '+'X'*width+'\n','   50 END \n'])
    for n,(a,b) in enumerate([(257,127),(-257,127),(256,127),(32767,0),(32767,1),
                              (-32767,-1),(181,181),(-181,181)]):
        yield case(f'multiplication-boundary-{n}', 'arithmetic',
                   f'PRINT ({a})*({b})\nA={a}\nB={b}\nPRINT A*B\n', [a*b,a*b])
    for op in comparisons:
        yield case(f'comparison-subtraction-overflow-{op}', 'errors',
                   f'A=17\nPRINT 32767{op}(-32767)\nPRINT (-32767){op}32767\nPRINT A\n',
                   [17], ['>32767','>32767'])
    yield case('literal-range-and-recovery', 'errors',
               'PRINT 32768\nPRINT -32768\nPRINT 32767\nPRINT -32767\n',
               [32767,-32767], ['>32767','>32767'])
    yield case('auto-default-increment', 'editing',
               'AUTO 100\nPRINT 1\nPRINT 2\n\x04\nLIST\nRUN\n', [1,2], ['END'],
               contains=['  100 PRINT 1\n','  110 PRINT 2\n'], absent=['  111 PRINT 2\n'])
    yield case('escape-cancels-partially-typed-line', 'editing',
               'PRINT 99\x1bPRINT 7\n', [7])
    yield case('list-tab-token-and-execute', 'editing',
               '10 TAB 5:PRINT "X"\n20 PRINT 42\n30 END\nLIST\nRUN\n', [42],
               contains=['   10 TAB 5: PRINT "X"\n','\n    X\n'])
    yield case('mixed-string-numeric-input', 'input',
               '10 DIM A$(10)\n20 INPUT A$,B\n30 PRINT A$\n40 PRINT B\n'
               '50 END\nRUN\nHELLO\n7\n', [7], contains=['\nHELLO\n'])
