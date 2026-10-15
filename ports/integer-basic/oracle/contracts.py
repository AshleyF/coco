"""Directed, portable partitions and persistent-state BASIC scenarios.

Expected results are stated before recording. Original-specific semantics are
identified explicitly; frozen observations alone are not independent validation.
"""


def extended_cases(case):
    yield case('color-placeholder-byte-checks-and-listing', 'memory',
               'A=23\nCOLOR=0\nCOLOR=255\nCOLOR=256\nCOLOR=-1\nCOLOR="X"\n'
               'PRINT A\n10 COLOR=7\n20 PRINT 17\n30 END\nLIST\nRUN\n',
               [23,17], ['>255','>255','SYNTAX'], contains=['   10 COLOR=7\n'])
    for name,opening in [('parentheses','('),('functions','ABS(')]:
        valid=opening*13+'1'+')'*13
        invalid=opening*14+'1'+')'*14
        yield case(f'parser-stack-boundary-{name}', 'tokenizer',
                   f'A=17\nPRINT {valid}\nPRINT {invalid}\nPRINT A\n',
                   [1,17], ['TOO LONG'])
    yield case('parser-flat-expression-boundary-and-state', 'tokenizer',
               'A=17\nPRINT '+'+'.join(['1']*41)+'\nPRINT '+'+'.join(['1']*42)+'\nPRINT A\n',
               [41,17], ['TOO LONG'])
    yield case('parser-overflow-preserves-replaced-program', 'tokenizer',
               '10 PRINT 17\n20 END\n10 PRINT '+'('*20+'1'+')'*20+'\nLIST\nRUN\n',
               [17], ['TOO LONG'], contains=['   10 PRINT 17\n'])
    yield case('parser-overflow-before-output', 'tokenizer',
               'A=17\nPRINT "HEAD";'+'('*20+'1'+')'*20+'\nPRINT A\n',
               [17], ['TOO LONG'], absent=['\nHEAD'])
    key_event = {'after':'\n1\n','key':ord('P')}
    yield case('keyboard-stop-preserves-scalar-and-key', 'keyboard-events',
               '10 A=0\n20 A=A+1:PRINT A\n30 GOTO 20\nRUN\nRINT A\nPRINT 17\n',
               [1,1,17], contains=['STOPPED AT 30\n>PRINT A\n'],event=key_event)
    yield case('keyboard-stop-retains-for-frame', 'keyboard-events',
               '10 FOR I=1 TO 2\n20 PRINT I\n30 NEXT I\n40 END\n'
               'RUN\nRINT I\nGOTO 30\nPRINT I\n',
               [1,1,2,3], contains=['STOPPED AT 30'],event=key_event)
    yield case('keyboard-stop-after-same-line-next-resumes', 'keyboard-events',
               '10 FOR I=1 TO 3:PRINT I:NEXT I\n20 END\nRUN\nRINT I\n',
               [1,2,3,4], contains=['STOPPED AT 20'],event=key_event)
    yield case('keyboard-stop-retains-gosub-frame', 'keyboard-events',
               '10 GOSUB 100\n20 PRINT 2:END\n100 PRINT 1\n110 RETURN\n'
               'RUN\nRINT 17\nGOTO 110\n',
               [1,17,2], contains=['STOPPED AT 110'],event=key_event)
    yield case('keyboard-stop-after-return-cursor-resumes', 'keyboard-events',
               '10 GOSUB 100:PRINT 2\n20 END\n100 PRINT 1:RETURN\nRUN\nRINT 17\n',
               [1,2,17], contains=['STOPPED AT 20'],event=key_event)
    yield case('keyboard-stop-before-first-line-after-run-clear', 'keyboard-events',
               '10 A=99\n20 END\nA=17\nRUN\nRINT A\n', [0],
               contains=['STOPPED AT 10'],event={'after':'>RUN\n','key':ord('P')})
    yield case('auto-overflow-cancel-and-recovery', 'editing',
               'AUTO 32767,1\nPRINT 3\n\x04\nLIST\nPRINT 17\n',
               [17], ['>32767'], contains=['\n32767 PRINT 3\n'])
    yield case('auto-invalid-entry-retains-number', 'editing',
               'AUTO 10\nBOGUS\nPRINT 1\n\x04\nLIST\n', errors=['SYNTAX'],
               contains=['   10 PRINT 1\n'], absent=['   20 PRINT 1\n'])
    yield case('list-functions-array-token-boundary', 'editing',
               '10 DIM A$(20),B$(20),C(5)\n'
               '20 IF A$#B$ THEN PRINT ABS(C(1)),RND(10)\n'
               '30 INPUT "VALUE",A$,C(1)\n40 END\nLIST\n',
               contains=['   20 IF A$#B$ THEN PRINT ABS (C(\n      1)), RND (10)\n'])
    for name,expression,value,listing in [
            ('abs','1+ABS(-2)',3,'1+ ABS (-2)'),
            ('sgn','SGN(-7)',-1,'SGN (-7)'),
            ('rnd','RND(10)',6,'RND (10)'),
            ('len','LEN(A$)',2,'LEN(A$)')]:
        yield case(f'list-function-execute-{name}', 'editing',
                   f'10 DIM A$(5)\n20 A$="HI"\n30 PRINT {expression}\n40 END\nLIST\nRUN\n',
                   [value], contains=[f'   30 PRINT {listing}\n'])
    for name,data,numbers,error in [
            ('surplus','1,2,3\n',[1,2],False),
            ('separate-lines','1\n2\n',[1,2],False),
            ('blank-retry','\n1,2\n',[1,2],True),
            ('trailing-comma-retry','1,\n2,3\n',[2,3],True),
            ('signed-spaces','+1, -2\n',[1,-2],False),
            ('split-digits','1 2,3\n',[12,3],False),
            ('suffix-retry','1,2X\n3,4\n',[3,4],True),
            ('fraction-retry','1.0,2\n3,4\n',[3,4],True)]:
        yield case(f'input-list-partition-{name}', 'input',
                   '10 INPUT A,B\n20 PRINT A\n30 PRINT B\n40 END\nRUN\n'+data,
                   numbers,['SYNTAX'] if error else [],
                   contains=['RETYPE LINE'] if error else [])
    # Independent bit recurrence for this fingerprinted image, rather than
    # deriving expectations from emulator RAM or freezing unanchored numbers.
    for bound in [1,2,255,256,32767,0,-2,-32767]:
        low = high = 0
        numbers = []
        errors = []
        bounds = [bound]*6 + [10,10]
        for divisor in bounds:
            if high == low == 0:
                high = 1
            high &= 127
            old = 256*high + low
            for _ in range(17):
                feedback = (((high*2)&255)+64)&255
                high,low = ((high*2)|(low>>7))&255, ((low*2)|(feedback>>7))&255
            if divisor == 0:
                errors.append('>32767')
            else:
                numbers.append((old % abs(divisor))*(-1 if divisor < 0 else 1))
        yield case(f'random-bound-state-{bound}', 'random',
                   f'PRINT RND({bound})\n'*6 + 'CLR\nPRINT RND(10)\nSCR\nPRINT RND(10)\n',
                   numbers,errors)
    yield case('string-name-spacing-and-numeric-suffix-rejection', 'errors',
               'DIM B $(5)\nB $="HI"\nPRINT B $\nPRINT LEN(B $)\n'
               'PRINT B $=B$\nDIM A1$(5)\nA1$="X"\nPRINT A1$\nPRINT B$\n',
               [2], ['SYNTAX']*4, contains=['\nHI\n'])
    yield case('dimension-word-size-overflow-preserves-storage', 'errors',
               'A=17\nDIM B(16384)\nDIM B(32767)\nPRINT A\n'
               'DIM C(2)\nC(2)=9\nPRINT C(2)\n', [17,9], ['RANGE','RANGE'])
    yield case('string-unary-and-boolean-type-errors', 'errors',
               'A=17\nDIM B$(5)\nB$="HI"\nPRINT +B$\nPRINT NOT B$\n'
               'PRINT B$ AND 1\nPRINT 1 OR B$\nPRINT A\n', [17], ['SYNTAX']*4)
    yield case('for-array-resize-repairs-active-variable', 'control',
               '10 DIM I(2)\n20 FOR I=1 TO 2\n30 DIM I(3)\n40 PRINT I\n'
               '50 NEXT I\n60 END\nRUN\nPRINT I\n', [1,2,3])
    yield case('input-literal-overflow-retry', 'input',
               '10 INPUT A\n20 PRINT A\n30 END\nRUN\n32768\n7\n',
               [7], ['>32767'], contains=['RETYPE LINE'])
    yield case('plot-placeholder-coordinate-boundaries', 'memory',
               'PLOT 255,1\nPLOT 1,47\nPLOT 256,1\nPLOT 1,48\nPRINT 17\n',
               [17], ['>255','RANGE'])
    yield case('syntax-preflight-no-output-or-allocation', 'errors',
               'A=7\nB=(\nDIM A(2)\nPRINT A(1)\nPRINT "HEAD";(\n'
               'DIM C(2),BOGUS\nDIM C(3)\nC(3)=9\nPRINT C(3)\n',
               [7,9], ['SYNTAX']*3, absent=['\nHEAD'])
    yield case('spaces-in-tokens-preserve-literal-spaces', 'editing',
               'P R I N T 1\nA 1=7\nPRINT A1\nPRINT 1 2\nPRINT "A B"\n'
               '10 P R I N T 7\n20 END\nLIST\nRUN\n', [1,7,12,7],
               contains=['\nA B\n','   10 PRINT 7\n'])
    yield case('conditional-prompt-for-initialization', 'control',
               'IF 0 THEN FOR I=1 TO 2\nIF 1 THEN FOR I=1 TO 2\nPRINT I\n', [1])
    yield case('string-byte-index-and-dimension-boundaries', 'errors',
               'DIM A$(0)\nDIM A$(256)\nDIM A$(5)\nA$="ABC"\n'
               'PRINT A$(256)\nPRINT A$(-1)\nPRINT A$\n',
               errors=['STRING','>255','>255','>255'], contains=['\nABC\n'])
    yield case('gosub-colon-return-cursor', 'control',
               '10 GOSUB 100:PRINT 2:END\n100 PRINT 1:RETURN:PRINT 99\nRUN\n', [1,2])
    yield case('gosub-loop-and-colon-cursors', 'control',
               '10 FOR I=1 TO 2:GOSUB 100:PRINT I:NEXT I:END\n'
               '100 FOR J=1 TO 2:PRINT I*10+J:NEXT J:RETURN\nRUN\n', [11,12,1,21,22,2])
    yield case('next-comma-order-and-cursors', 'control',
               '10 FOR I=1 TO 2:FOR J=1 TO 2:PRINT I*10+J:NEXT J,I:END\n'
               'RUN\nPRINT I\nPRINT J\n', [11,12,21,22,3,3])
    yield case('scalar-digit-name-boundaries-and-clr', 'variables',
               'A=17\nA0=7\nA9=9\nZ9=256\nPRINT A\nPRINT A0\nPRINT A9\nPRINT Z9\n'
               'A01=99\nAB=99\nPRINT A0\nCLR\nPRINT Z9\n', [17,7,9,256,7,0], ['SYNTAX','SYNTAX'])
    yield case('array-default-alias-and-last-dimension-growth', 'arrays',
               'A=7\nPRINT A(1)\nA(1)=9\nPRINT A\nDIM A(2)\n'
               'A(2)=23\nPRINT A(1)\nPRINT A(2)\n', [7,9,9,23])
    yield case('dimension-last-resize-and-earlier-rejection', 'errors',
               'DIM A(2),B(2)\nA(1)=7\nB(2)=9\nDIM A(3)\nPRINT A(1)\n'
               'DIM B(1)\nDIM B(2)\nPRINT B(2)\nDIM B(3)\nPRINT B(3)\n',
               [7,9,0], ['DIM'])
    yield case('string-overlap-original-copy-order', 'strings',
               'DIM A$(10)\nA$="ABCDE"\nA$=A$(2)\nPRINT A$\n'
               'A$(2)=A$\nPRINT A$\nPRINT LEN(A$)\n', [5],
               contains=['\nBCDE\n','\nBBBBB\n'])
    yield case('string-shrink-overflow-preserves-tail', 'errors',
               'DIM A$(4)\nA$="ABCD"\nDIM A$(2)\nA$="XYZ"\n'
               'PRINT A$\nPRINT LEN(A$)\nDIM A$(5)\nPRINT A$\n', [4],
               ['STR OVFL'], contains=['\nXYCD\n'])
    yield case('string-append-and-assignment-index-boundaries', 'errors',
               'DIM A$(10)\nA$="AB"\nA$(3)="X"\nPRINT A$\n'
               'A$(5)="Y"\nA$(2,3)="W"\nPRINT A$\nPRINT LEN(A$)\n', [3],
               ['STRING','SYNTAX'], contains=['\nABX\n'])
    yield case('string-type-errors-preserve-scalars', 'errors',
               'A=17\nDIM B$(5)\nB$="HI"\nA=B$\nPRINT A\n'
               'PRINT 1+B$\nIF B$<"ZZ" THEN PRINT 99\nPRINT B$=B$\n'
               'PRINT ABS(B$)\nPRINT A\n', [17,17], ['SYNTAX']*5)
    yield case('input-retry-whole-numeric-list', 'input',
               '10 INPUT A,B\n20 PRINT A\n30 PRINT B\n40 END\nRUN\n7,X\n8,9\n',
               [8,9], ['SYNTAX'], contains=['RETYPE LINE'])
    yield case('input-rejects-expression-and-recovers', 'input',
               '10 INPUT A\n20 PRINT A\n30 END\nRUN\n1+2\n7\n',
               [7], ['SYNTAX'], contains=['RETYPE LINE'])
    # A declared scratch RAM byte range, not an Apple hardware/workspace address.
    yield case('memory-byte-values-and-error-state', 'memory',
               'POKE 768,0\nPRINT PEEK(768)\nPOKE 768,255\nPRINT PEEK(768)\n'
               'POKE 768,256\nPRINT PEEK(768)\nPOKE 768,-1\n'
               'PRINT PEEK(768)\nPRINT 17\n', [0,255,255,255,17], ['>255','>255'])
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
