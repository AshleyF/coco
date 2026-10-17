"""Tests of the adaptation, not proof of equality with HP floating point BASIC."""
from pathlib import Path
import hashlib,json,math,os,re,subprocess,sys,time
HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[1]
original=(HERE/'STTR1.original.bas').read_bytes()
assert hashlib.sha256(original).hexdigest()=='69dfa0122e3dd9299fbf5764419e13de1bf42fd34fb2d0a3104847c57b6ef396'
source=(HERE/'STTR1.integer.bas').read_text()
subprocess.run([sys.executable,str(HERE/'adapt.py')],check=True)
assert (HERE/'STTR1.integer.bas').read_text()==source,'Checked-in derived source is stale'
# Attribution and every numbered original remark survive in the derived source.
for line in original.decode().splitlines():
    m=re.match(r'^(\d+)\s+(REM.*)$',line)
    if m:assert f'{m[1]} {m[2]}\n' in source,line
assert 'EXTRACTED FROM HP TAPE IMAGE 16-NOV-2003 BY PETE TURNBULL' in source
assert all(len(l)<128 for l in source.splitlines()),'Apple-1 input line too long'
if '--compact' in sys.argv:
    subprocess.run([sys.executable,str(HERE/'compact.py')],check=True)
    source=(HERE/'STTR1.compact.bas').read_text()
results=[]
def run(name,body,moves='',expected=(),forbidden=(),entry='RUN',independent=False):
    # Insert highest line first: identical stored program, far fewer ROM moves.
    # This also makes a full independent Python CPU run practical.
    if '--compact' in sys.argv:body=body.replace('GOSUB 5510','GOSUB 5520')
    ordered='\n'.join(sorted(body.splitlines(),key=lambda l:int(l.split()[0]),reverse=True))+'\n'
    script='HIMEM=32767\nLOMEM=2048\n'+ordered+entry+'\n'+moves
    r=subprocess.run([str(ROOT/'build/apple1'),str(ROOT/'reference/a1basic.bin'),'1000000000'],input=script,text=True,capture_output=True,timeout=60,env={**os.environ,'APPLE1_RAM_TOP':'0x8000'})
    assert r.returncode==0,(name,r.stderr,r.stdout[-1000:])
    assert 'ERR' not in r.stdout,(name,r.stdout[r.stdout.find('ERR')-100:][:200])
    out=r.stdout.split('>'+entry+'\n',1)[1]
    for text in expected:assert text in out,(name,text,out)
    for text in forbidden:assert text not in out,(name,text,out)
    if independent:
        sys.path.insert(0,str(ROOT/'oracle'))
        from py65_runner import run as py_run
        other=py_run(script,200000000,ram_top=0x8000)
        assert other['status']==0 and other['output']==r.stdout,name+' independent CPU mismatch'
    native_checked=False
    if '--native-large' in sys.argv and name!='tokenized-size':
        n=subprocess.run(['node',str(ROOT/'native/large-runner.mjs')],input=ordered+entry+'\n'+moves,text=True,capture_output=True,timeout=120)
        assert n.returncode==0,(name,n.stderr,n.stdout[-1000:])
        native_out=n.stdout.split('>'+entry+'\n',1)[1]
        assert native_out==out,(name,'native transcript differs',native_out,out)
        native_checked=True
    results.append({'id':name,'independent_cpu':independent,'native_mc6809':native_checked,'transcript':out})
    print(name+': passed',flush=True)
    return out
run('instructions',source,'YES\n',expected=['BY MIKE MAYFIELD','COURSE USES TENTHS','COMMAND 7 = LIBRARY COMPUTER','COMMAND:?'])
run('scans-status-map',source,'NO\n1\n2\n7\n0\n7\n1\n',expected=['DESTROY 16 KLINGONS IN 30 STARDATES','LONG RANGE SCAN QUADRANT 1,2',': 104 :005 :001 :','1 104 005 001','NUMBER OF KLINGONS LEFT = 16','COMPUTER    0.0'],forbidden=['+++'])
run('fractional-navigation-calculator',source,'NO\n5\n1500\n0\n15\n2\n7\n2\nYES\n1,1,8,8\n',expected=['QUADRANT 1,2 SECTOR 1,8','ENERGY 1504 TORPEDOES 10','SHIELDS 1500','DIRECTION = 8.0','DISTANCE = 9.8'],independent='--crosscheck' in sys.argv)
# Controlled scenarios target state transitions without depending on a random
# journey to a particular encounter. All game statements remain unchanged.
dims='DIM G(64),C(18),K(9),N(3),Z(64),D(8),C$(6),D$(72),E$(24),A$(3),Q$(72),R$(72),S$(48),Z$(72),U$(72)'
base=[dims,'Q$="'+' '*72+'":R$=Q$:S$=Q$(1,48):Z$=Q$',
'D$="WARP ENGINESS.R. SENSORSL.R. SENSORSPHASER CNTRLPHOTON TUBESDAMAGE CNTRL"','E$="SHIELD CNTRLCOMPUTER    "',
'Q1=4:Q2=4:S1=4:S2=4:E=3000:E0=3000:S=1500:P=10:T0=3000:T=3001:T9=30',
'K3=1:K9=2:K7=2:K(1)=5:K(2)=4:K(3)=200:C$="RED"',
'Z1=4:Z2=4:A$="<*>":GOSUB 5510','Z1=5:Z2=4:A$="+++":GOSUB 5510',
'C(1)=0:C(2)=1:C(3)=-1:C(4)=1:C(5)=-1:C(6)=0:C(7)=-1:C(8)=-1:C(9)=0',
'C(10)=-1:C(11)=1:C(12)=-1:C(13)=1:C(14)=0:C(15)=1:C(16)=1:C(17)=0:C(18)=1']
def fixture(name,extra,moves='',expected=(),forbidden=()):
    setup='\n'.join(f'{9000+i} {line}' for i,line in enumerate(base+extra))+'\n'
    return run(name,source+setup,moves,expected,forbidden,entry='RUN 9000')
fixture('phasers',['GOTO 2530'],'1000\n',['112 HIT ON ENTERPRISE','1388 SHIELDS LEFT','720 HIT ON KLINGON','KLINGON AT SECTOR 5,4 DESTROYED'])
fixture('torpedo-hit',['GOTO 2800'],'70\n',['   5,4','*** KLINGON DESTROYED ***'])
fixture('torpedo-miss',['GOTO 2800'],'10\n',['   4,5','   4,8','TORPEDO MISSED','1388 SHIELDS LEFT'])
fixture('dock-refill',['E=10:P=0:S=1500:B3=1:Z1=4:Z2=5:A$=">!<":GOSUB 5510','GOSUB 4120:PRINT "CHECK ";D0;",";E;",";P;",";S:END'],expected=['CONDITION DOCKED','CHECK 1,3000,10,0'])
fixture('victory-and-restart',['K9=1:GOTO 2530'],'3000\n',['THE FEDERATION HAS BEEN SAVED !!!','EFFICIENCY = 2000','DESTROY 14 KLINGONS','COMMAND:?'])
fixture('loss-and-restart',['S=0:GOSUB 3790:END'],expected=['THE ENTERPRISE HAS BEEN DESTROYED','THERE ARE STILL 2 KLINGONS','DESTROY 14 KLINGONS','COMMAND:?'])
fixture('phasers-no-enemies',['K3=0:GOTO 2530'],expected=['NO KLINGONS IN THIS QUADRANT'])
fixture('sensors-disabled',['D(3)=-10:GOTO 2330'],expected=['LONG RANGE SENSORS ARE INOPERABLE'])
fixture('phasers-disabled',['D(4)=-10:GOTO 2530'],expected=['PHASER CONTROL IS DISABLED'])
fixture('torpedoes-disabled',['D(5)=-10:GOTO 2800'],expected=['PHOTON TUBES ARE NOT OPERATIONAL'])
fixture('torpedoes-empty',['P=0:GOTO 2800'],expected=['ALL PHOTON TORPEDOES EXPENDED'])
fixture('shields-disabled',['D(7)=-10:GOTO 3460'],expected=['SHIELD CONTROL IS NON-OPERATIONAL'])
fixture('computer-disabled',['D(8)=-10:GOTO 4630'],expected=['COMPUTER DISABLED'])
fixture('damage-report-disabled',['D(6)=-10:GOTO 3560'],expected=['DAMAGE CONTROL REPORT IS NOT AVAILABLE'])
fixture('stardate-loss',['T=T0+T9+1:GOTO 3970'],expected=['IT IS STARDATE 3031','THERE ARE STILL 2 KLINGONS','COMMAND:?'])
fixture('dock-blocks-attack',['C$="DOCKED":GOSUB 3790:PRINT "SHIELDS ";S:END'],expected=['STAR BASE SHIELDS PROTECT','SHIELDS 1500'],forbidden=['HIT ON ENTERPRISE'])
# Exhaustively check the actual BASIC distance routine over the game's domain.
helper='\n'.join(l for l in source.splitlines() if 7220<=int(l.split()[0])<=7250)+'\n'
code=helper+'9000 FOR U0=-7 TO 7:FOR U1=-7 TO 7:GOSUB 7220:PRINT U3:NEXT U1:NEXT U0:END\n'
out=run('distance-domain-225',code,entry='RUN 9000')
actual=[int(v) for v in re.findall(r'^\d+$',out,re.M)]
assert actual==[math.isqrt((x*x+y*y)*100) for x in range(-7,8) for y in range(-7,8)]
# Verify nontruncating substring replacement at every one of the 64 cells.
helpers='\n'.join(l for l in source.splitlines() if 5510<=int(l.split()[0])<=5600)+'\n'
code=helpers+'9000 DIM Q$(72),R$(72),S$(48),U$(72),A$(3)\n9001 Q$="'+' '*72+'":R$=Q$:S$=Q$(1,48)\n9002 FOR Z1=1 TO 8:FOR Z2=1 TO 8:A$="+++":GOSUB 5510:NEXT Z2:NEXT Z1\n9003 PRINT LEN(Q$);",";LEN(R$);",";LEN(S$):PRINT Q$:PRINT R$:PRINT S$:END\n'
out=run('all-64-string-cells',code,expected=['72,72,48','+'*72+'\n'+'+'*72+'\n'+'+'*48+'\n'],entry='RUN 9000')
# Measure stored token bytes, not the source file size.
out=run('tokenized-size',source,entry='PRINT 32767-PEEK(202)-256*PEEK(203)')
size=int(re.search(r'^\d+$',out,re.M)[0])
report={'native_binary_sha256':hashlib.sha256((ROOT/'build/graphics64.bin').read_bytes()).hexdigest() if '--native-large' in sys.argv else None,'original_sha256':hashlib.sha256(original).hexdigest(),'adapted_sha256':hashlib.sha256(source.encode()).hexdigest(),'tokenized_program_bytes':size,'apple_ram_top':32768,'full_native_coco_game_tested':'--native-large' in sys.argv,'hp_behavior_equivalence_claimed':False,'results':results}
report_name='mayfield-compact-native-test.json' if '--native-large' in sys.argv else 'mayfield-compact-test.json' if '--compact' in sys.argv else 'mayfield-adaptation-crosscheck.json' if '--crosscheck' in sys.argv else 'mayfield-adaptation-test.json'
(ROOT/'build'/report_name).write_text(json.dumps(report,indent=2)+'\n')
print(f'{len(results)} scenarios passed; {size} token bytes. See report for native profile coverage.')
