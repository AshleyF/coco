"""Independent 6809/CoCo-ROM cassette loading and execution, including WAV audio.

Requires an externally installed XRoar with null UI and trap support. No ROM,
interpreter, CPU, tape decoder or machine implementation from our JS emulator
is used by the external process. XRoar's automatic keyboard supplies commands.
"""
import argparse
import hashlib
import json
import re
import subprocess
from itertools import product
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
PROJECT=ROOT.parents[1]
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--xroar',default='xroar')
parser.add_argument('--graphics',action='store_true')
args=parser.parse_args()
profile='graphics' if args.graphics else 'prompt'
report_prefix='graphics-xroar' if args.graphics else 'xroar'
symbols={m[1]:int(m[2],16) for line in (ROOT/f'build/{profile}.sym').read_text().splitlines()
         if (m:=re.fullmatch(r'(\w+) EQU \$([\da-f]+)',line,re.I))}
binary=(ROOT/f'build/{profile}.bin').read_bytes()
sha=lambda data:hashlib.sha256(data).hexdigest()
results=[]
program='\n'.join([
    '10 DIM A(3),B$(10)','20 B$="ABC"','30 FOR I=1 TO 3',
    '40 A(I)=I*7:GOSUB 100','50 NEXT I','60 IF B$#"ABC" THEN END',
    '70 PRINT ABS(-7);":";SGN(-1);":";LEN(B$)',
    '80 PRINT A(1)+A(2)+A(3)',
    '90 POKE 1536,A(1)+A(2)+A(3):POKE 1537,43:END',
    '100 PRINT B$;A(I):RETURN','RUN',''])
scenarios=[('console',r'CLOADM\rEXEC\rPRINT 6*7\rPOKE 1536,42\rPOKE 1537,43\r',
            ['F INTBASIC','>PRINT 6*7','>POKE 1537,43']),
           ('program',r'CLOADM\rEXEC\r'+program.replace('\n',r'\r'),
            ['ABC7','ABC14','ABC21','7:-1:3'])]
for format_,(scenario,typed,expected) in product(['cas','wav'],scenarios):
    image=ROOT/f'build/{profile}.{format_}'
    snapshot=ROOT/f'build/{report_prefix}-{format_}-{scenario}.ram'
    # Reject a stale snapshot left by an earlier successful run.
    if snapshot.exists():snapshot.unlink()
    command=[args.xroar,'-c','/dev/null','-ui','null','-ao','null','-vo','null',
        '-machine','cocous','-ram','32','-bas',str(PROJECT/'roms/bas13.rom'),
        '-extbas',str(PROJECT/'roms/extbas11.rom'),'-nodos','-no-ratelimit',
        '-no-tape-fast','-no-tape-pad-auto','-load-tape',str(image),
        '-type',typed,
        # The second native POKE has been parsed; the first marker must already
        # have been written. This avoids relying on watchpoint pre/post timing.
        '-trap',f'pc={symbols["t_pc_ef0a"]}','-trap-range','2',
        '-trap-snap',str(snapshot),'-trap-timeout','0','-timeout','300','-verbose','2']
    run=subprocess.run(command,capture_output=True,text=True,timeout=45,cwd=ROOT)
    (ROOT/f'build/{report_prefix}-{format_}-{scenario}.log').write_text(run.stdout+run.stderr)
    assert run.returncode==0,(format_,run.stderr[-1000:])
    assert snapshot.exists(),f'{format_}: native POKE checkpoint never reached'
    ram=snapshot.read_bytes()
    assert len(ram)==32768
    assert ram[1536]==42,f'{format_}: native execution marker missing'
    offset=0
    segments=0
    while binary[offset]==0:
        length=int.from_bytes(binary[offset+1:offset+3],'big')
        address=int.from_bytes(binary[offset+3:offset+5],'big')
        assert ram[address:address+length]==binary[offset+5:offset+5+length],(
            format_,f'loaded native segment ${address:04x} differs')
        segments+=1
        offset+=5+length
    def char(byte):
        code=byte&63
        return chr(code+64 if code<32 else code)
    screen='\n'.join(''.join(map(char,ram[i:i+32])) for i in range(0x400,0x600,32))
    if args.graphics:
        # Decode the snapshot bitmap without our JS CPU, VDG or screen decoder.
        font=json.loads((ROOT/'native/terminal-font.json').read_text())
        glyphs={tuple(v&252 for v in rows):chr(i+64 if i<32 else i) for i,rows in enumerate(font)}
        lines=[]
        for row in range(24):
            line=''
            for col in range(40):
                bits=[]
                for dy in range(8):
                    value=0
                    for dx in range(6):
                        x=8+col*6+dx
                        if ram[0x800+(row*8+dy)*32+(x>>3)]&(128>>(x&7)):value|=128>>dx
                    bits.append(value)
                line+=glyphs.get(tuple(bits),' ' if all(v==252 for v in bits) else '?')
            lines.append(line)
        screen='\n'.join(lines)
        expected=[v for v in expected if not v.startswith('F INTBASIC')]
    for fragment in expected:assert fragment in screen,(format_,scenario,fragment,screen)
    assert re.search(r'\n42\s*\n',screen),screen
    assert '?IO ERROR' not in screen and 'ERR' not in screen
    results.append({'format':format_,'scenario':scenario,'passed':True,'image_sha256':sha(image.read_bytes()),
        'native_segments_checked':segments,'marker':ram[1536],'screen':screen,
        'command':command})
    print(f'Independent XRoar {format_.upper()} {scenario}: real tape timing, every native segment, expected results and computed marker passed.')
assert sha((ROOT/f'build/{profile}.bin').read_bytes())==sha(binary),'Native build changed during validation'
version=subprocess.run([args.xroar,'-version'],capture_output=True,text=True,cwd=ROOT)
report={'native_sha256':sha(binary),'emulator_version':version.stdout.strip()+version.stderr.strip(),
        'scope':'Independent 6809 core and CoCo machine; tape acceleration and leader padding disabled',
        'results':results}
(ROOT/f'build/{report_prefix}-acceptance.json').write_text(json.dumps(report,indent=2)+'\n')
