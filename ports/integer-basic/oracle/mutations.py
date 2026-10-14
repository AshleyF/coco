"""Behavioral fault detection matrix; temporary ROMs, reference never modified.

Each declared fault must be rejected by an independent semantic assertion.
Transcript-only detections are separate and insufficient to pass this check.
This selected fault set is not an exhaustive mutation adequacy measurement.
"""
import hashlib
import json
import tempfile
from pathlib import Path
from behavior import GOLDEN, assert_behavior, cases
from golden import ROOT, ROM, execute


def main():
    rows = [json.loads(line) for line in GOLDEN.read_text().splitlines()]
    metadata, suite = rows[0], rows[1:]
    original = ROM.read_bytes()
    if hashlib.sha256(original).hexdigest() != metadata['rom_sha256']:
        raise RuntimeError('reference fingerprint changed')
    definitions = list(cases())
    if len(definitions) != len(suite) or any(
            any(saved.get(k) != case[k] for k in case)
            for saved,case in zip(suite,definitions)):
        raise RuntimeError('baseline does not match current case definitions')
    swaps = [
        ('addition-as-subtraction',0x12,0x13),
        ('multiplication-as-division',0x14,0x15),
        ('division-as-multiplication',0x15,0x14),
        ('mod-as-division',0x1f,0x15),
        ('numeric-equality-inverted',0x16,0x17),
        ('numeric-inequality-inverted',0x17,0x16),
        ('alternate-inequality-inverted',0x1b,0x16),
        ('greater-equal-as-greater',0x18,0x19),
        ('less-equal-as-less',0x1a,0x1c),
        ('string-equality-inverted',0x39,0x3a),
        ('boolean-operator-swapped',0x1d,0x1e),
        ('clr-does-nothing',0x0c,0x35),
        ('absolute-value-as-sign',0x31,0x30),
        ('unary-minus-does-nothing',0x36,0x35),
    ]
    faults = []
    for name,token,replacement in swaps:
        patches = [(0xa10+token, original[0xa10+token], original[0xa10+replacement]),
                   (0xa88+token, original[0xa88+token], original[0xa88+replacement])]
        faults.append((name,patches))
    faults.append(('string-character-comparison-always-equal',
                   [(0x212,0xc5,0xd1),(0x213,0xe4,0xda)]))
    faults.extend([
        ('gosub-limit-seven-instead-of-eight',[(0x841,0x08,0x07)]),
        ('for-limit-seven-instead-of-eight',[(0x93f,0x08,0x07)]),
        ('list-tab-token-table-boundary',[(0x0b4,0x51,0x50)]),
        ('escape-cancel-character-wrong',[(0x28b,0x9b,0x9a)]),
        ('auto-default-eleven-instead-of-ten',[(0x7f2,0x0a,0x0b)]),
        ('mixed-input-sentinel-wrong',[(0xfc4,0x74,0x75)]),
    ])
    report = []
    with tempfile.TemporaryDirectory() as temp:
        for name,patches in faults:
            rom = bytearray(original)
            for offset,expected,replacement in patches:
                if rom[offset] != expected:
                    raise RuntimeError(f'{name}: unexpected byte at {offset+0xe000:04X}')
                rom[offset] = replacement
            candidate = Path(temp)/f'{name}.bin'
            candidate.write_bytes(rom)
            semantic, transcript, crashes = [], [], []
            reasons = {}
            for case in suite:
                try:
                    observed = execute(case,None,rom=candidate)
                except RuntimeError as error:
                    crashes.append(case['id'])
                    reasons[case['id']] = str(error)
                    continue
                try:
                    assert_behavior(case,observed)
                except AssertionError as error:
                    semantic.append(case['id'])
                    reasons[case['id']] = str(error)
                else:
                    if observed['output'] != case['output'] or observed['status'] != case['status']:
                        transcript.append(case['id'])
            report.append({'mutation':name,
                'patches':[{'address':f'{offset+0xe000:04X}','before':expected,'after':replacement}
                           for offset,expected,replacement in patches],
                'semantic_detectors':semantic,'transcript_only_detectors':transcript,
                'runner_failures':crashes,'reasons':reasons,
                'status':'detected' if semantic else 'survived-semantic-checks'})
            print(f'{name}: {len(semantic)} semantic detectors, {len(transcript)} transcript-only',flush=True)
    feature_matrix = {feature:{fault['mutation']:[c['id'] for c in suite
                      if c['feature']==feature and c['id'] in fault['semantic_detectors']]
                      for fault in report}
                      for feature in sorted({c['feature'] for c in suite})}
    detected = sum(bool(f['semantic_detectors']) for f in report)
    result = {'scope':'selected behavioral faults; not exhaustive mutation adequacy',
              'cases':len(suite),'mutations':len(report),'semantically_detected':detected,
              'semantic_detection_percent':round(100*detected/len(report),2),
              'faults':report,'feature_detection_matrix':feature_matrix}
    (ROOT/'build/mutation-report.json').write_text(json.dumps(result,indent=2)+'\n')
    print(f'{detected}/{len(report)} selected faults detected by semantic assertions')
    if detected != len(report):
        raise SystemExit(1)


if __name__ == '__main__':
    main()
