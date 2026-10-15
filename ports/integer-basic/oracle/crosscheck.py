"""Verify frozen acceptance transcripts with an independent 6502 core."""
import hashlib
import json
from behavior import GOLDEN, assert_behavior
from golden import ROOT, ROM
from py65_runner import run


def main():
    rows = [json.loads(line) for line in GOLDEN.read_text().splitlines()]
    if rows[0]['rom_sha256'] != hashlib.sha256(ROM.read_bytes()).hexdigest():
        raise RuntimeError('reference fingerprint changed')
    failures = []
    for case in rows[1:]:
        observed = run(case['input'],case['budget'],case.get('event'))
        try:
            assert_behavior(case,observed)
            if observed['output'] != case['output'] or observed['status'] != case['status']:
                raise AssertionError('frozen output/status differs')
        except AssertionError as error:
            failures.append({'case':case['id'],'reason':str(error)})
    report = {'core':'py65 1.2.0 NMOS 6502','rom_sha256':rows[0]['rom_sha256'],
              'scope':'independent CPU core; shared console policy and ROM image',
              'cases':len(rows)-1,'matched':len(rows)-1-len(failures),'failures':failures}
    (ROOT/'build/crosscheck-report.json').write_text(json.dumps(report,indent=2)+'\n')
    print(f'{report["matched"]}/{report["cases"]} golden transcripts match independent py65 core',flush=True)
    if failures:
        print(json.dumps(failures[:10],indent=2))
        raise SystemExit(1)


if __name__ == '__main__':
    main()
