"""Record SAVE with independent XRoar's actual ROM/DAC, not byte interception."""
import argparse,json,re,subprocess,hashlib
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--xroar',default='xroar');p.add_argument('--graphics',action='store_true');args=p.parse_args()
profile='graphics' if args.graphics else 'prompt';prefix='graphics-xroar' if args.graphics else 'xroar'
root=Path(__file__).resolve().parents[1];project=root.parents[1]
symbols={m[1]:int(m[2],16) for line in (root/f'build/{profile}.sym').read_text().splitlines() if (m:=re.fullmatch(r'(\w+) EQU \$([\da-f]+)',line,re.I))}
wav=root/f'build/{prefix}-program.wav';snap=root/f'build/{prefix}-save.ram'
for f in [wav,snap]:
 if f.exists():f.unlink()
cmd=[args.xroar,'-c','/dev/null','-ui','null','-ao','null','-vo','null','-machine','cocous','-ram','32','-bas',str(project/'roms/bas13.rom'),'-extbas',str(project/'roms/extbas11.rom'),'-nodos','-no-ratelimit','-no-tape-fast','-no-tape-pad-auto','-load-tape',str(root/f'build/{profile}.cas'),'-tape-write',str(wav),'-type',r'CLOADM\rEXEC\r10 PRINT 42\r20 END\rSAVE "XROAR"\rPOKE 1536,42\rPOKE 1537,43\r','-trap',f'pc={symbols["t_pc_ef0a"]}','-trap-range','2','-trap-snap',str(snap),'-trap-timeout','0','-timeout','300']
r=subprocess.run(cmd,capture_output=True,text=True,cwd=root,timeout=45)
(root/f'build/{prefix}-save.log').write_text(r.stdout+r.stderr)
assert r.returncode==0 and snap.exists(),r.stderr[-1000:]
ram=snap.read_bytes();assert ram[1536]==42
assert wav.exists() and wav.stat().st_size>1000
report={'native_sha256':hashlib.sha256((root/f'build/{profile}.bin').read_bytes()).hexdigest(),'wav_sha256':hashlib.sha256(wav.read_bytes()).hexdigest(),'command':cmd,'scope':'Independent XRoar actual cassette DAC output; no tape acceleration','passed':True}
(root/f'build/{prefix}-save.json').write_text(json.dumps(report,indent=2)+'\n')
print('Independent XRoar SAVE generated actual cassette WAV via CoCo ROM/DAC.')
