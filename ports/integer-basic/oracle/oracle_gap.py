"""Sampled ROM-region oracle-gap analysis inspired by arXiv:2309.02395.

Samples branch and immediate mutations independently of test outcomes. Uncovered
sites remain in the raw denominator; covered scores use only witnessed sites.
Regions are fixed 256-byte ROM pages, not inferred functions. Surviving mutants
are review candidates, not proven missing tests or proven equivalent programs.
"""
import argparse
import hashlib
import json
import random
import tempfile
from pathlib import Path
from behavior import GOLDEN, assert_behavior, cases
from golden import ROOT, ROM, execute, instruction_map

BRANCHES = {'BPL','BMI','BVC','BVS','BCC','BCS','BNE','BEQ'}
IMMEDIATE = {'LDA','LDX','LDY','CMP','CPX','CPY','AND','ORA','EOR','ADC','SBC'}


def percentage(n, d):
    return round(100*n/d,2) if d else None


def scores(covered_entries, entries, faults):
    covered_faults = [f for f in faults if f['covered']]
    killed = sum(f['detected'] for f in faults)
    killed_covered = sum(f['detected'] for f in covered_faults)
    coverage = percentage(covered_entries,entries)
    raw = percentage(killed,len(faults))
    covered = percentage(killed_covered,len(covered_faults))
    return {'instruction_entries':entries,'executed_entries':covered_entries,
            'coverage_percent':coverage,'sampled_mutants':len(faults),
            'covered_mutants':len(covered_faults),'detected_mutants':killed,
            'raw_mutation_score_percent':raw,'covered_mutation_score_percent':covered,
            'raw_oracle_gap_pp':round(coverage-raw,2) if raw is not None else None,
            'covered_oracle_gap_pp':round(coverage-covered,2) if covered is not None else None,
            'semantic_detectors':sum(f['detection_kind']=='semantic' for f in faults),
            'transcript_only_detectors':sum(f['detection_kind']=='transcript' for f in faults),
            'execution_failure_detectors':sum(f['detection_kind'] in ('runner-failure','termination') for f in faults),
            'covered_survivors':[f['id'] for f in covered_faults if not f['detected']],
            'uncovered_mutants':[f['id'] for f in faults if not f['covered']]}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--per-region',type=int,default=3)
    parser.add_argument('--seed',type=int,default=230902395)
    parser.add_argument('--previous',type=Path,help='compare a prior report using the identical ROM and mutation sample')
    args = parser.parse_args()
    if args.per_region < 1: parser.error('per-region must be positive')
    rows = [json.loads(s) for s in GOLDEN.read_text().splitlines()]
    suite = rows[1:]
    original = ROM.read_bytes()
    digest = hashlib.sha256(original).hexdigest()
    if rows[0]['rom_sha256'] != digest: raise RuntimeError('reference fingerprint changed')
    definitions = list(cases())
    if len(definitions)!=len(suite) or any(any(saved.get(k)!=c[k] for k in c) for saved,c in zip(suite,definitions)):
        raise RuntimeError('baseline does not match definitions')
    coverage = json.loads((ROOT/'build/behavior-coverage.json').read_text())
    if (coverage['cases'] != len(suite) or coverage.get('rom_sha256')!=digest or
            coverage.get('suite_sha256')!=hashlib.sha256(GOLDEN.read_bytes()).hexdigest()):
        raise RuntimeError('run behavior-test to refresh fingerprinted coverage')
    mapping = instruction_map()
    witnesses = coverage['case_witnesses']
    by_id = {c['id']:c for c in suite}
    if any(c not in by_id for ids in witnesses.values() for c in ids):
        raise RuntimeError('coverage witnesses do not match baseline')
    candidates = {}
    for a,source in mapping.items():
        if source.split()[0] in BRANCHES:
            candidates.setdefault((a & 0xff00,'branch-invert'),[]).append(a)
        elif source.split()[0] in IMMEDIATE and source.split()[1].startswith('#'):
            candidates.setdefault((a & 0xff00,'immediate-xor1'),[]).append(a)
    rng = random.Random(args.seed)
    selected = sorted((a,family) for (page,family),addresses in sorted(candidates.items())
                      for a in rng.sample(addresses,min(args.per_region,len(addresses))))
    faults = []
    with tempfile.TemporaryDirectory() as temp:
        for a,family in selected:
            site = f'{a:04X}'
            relevant = witnesses.get(site,[])
            offset = a-0xe000+(family=='immediate-xor1')
            mask = 0x20 if family=='branch-invert' else 1
            fault = {'id':f'{family}-{site}','site':site,'patch_address':f'{offset+0xe000:04X}',
                     'operator':family,'region':f'{a & 0xff00:04X}',
                     'instruction':mapping[a],'before':original[offset],
                     'after':original[offset]^mask,'covered':bool(relevant),
                     'covering_cases':len(relevant),'evaluated_cases':0,'detected':False,
                     'detection_kind':None,'detected_by':None,'reason':None,
                     'review_status':'uncovered' if not relevant else 'unresolved-survivor'}
            if relevant:
                rom = bytearray(original)
                rom[offset] ^= mask
                path = Path(temp)/'mutant.bin'
                path.write_bytes(rom)
                # Unchanged deterministic code before this site means a test
                # that never reaches it cannot detect this single-site fault.
                # Stop on first detector; survivors exhaust ALL covering cases.
                for case_id in relevant:
                    c = by_id[case_id]
                    fault['evaluated_cases'] += 1
                    kind = reason = None
                    try:
                        observed = execute(c,None,rom=path)
                    except RuntimeError as error:
                        kind,reason = 'runner-failure',str(error)
                    else:
                        if observed['status'] != c['status']:
                            kind,reason = 'termination',f'status {observed["status"]}; expected {c["status"]}'
                        else:
                            try:
                                assert_behavior(c,observed)
                            except AssertionError as error:
                                kind,reason = 'semantic',str(error)
                            else:
                                if observed['output'] != c['output']:
                                    kind,reason = 'transcript','full frozen transcript differs'
                    if kind:
                        fault.update(detected=True,detection_kind=kind,detected_by=case_id,
                                     reason=reason,review_status='detected')
                        break
            faults.append(fault)
            print(f'{fault["id"]}: {fault["review_status"]} ({fault["detection_kind"]})',flush=True)
    regions = []
    for page in range(0xe000,0xf000,0x100):
        entries = [a for a in mapping if a & 0xff00 == page]
        if not entries: continue
        fs = [f for f in faults if f['region']==f'{page:04X}']
        result = scores(sum(f'{a:04X}' in witnesses for a in entries),len(entries),fs)
        result.update(region=f'{page:04X}-{page+255:04X}',
                      branch_candidates=len(candidates.get((page,'branch-invert'),[])),
                      immediate_candidates=len(candidates.get((page,'immediate-xor1'),[])))
        result['recommendation'] = ('review covered survivors and assertion strength' if result['covered_survivors']
                                  else 'add inputs for uncovered code' if result['uncovered_mutants']
                                  else 'expand mutation operators/sample' if fs
                                  else 'no sampled mutation evidence')
        regions.append(result)
    overall = scores(coverage['executed_entries'],len(mapping),faults)
    report = {'schema':1,'paper':'https://arxiv.org/pdf/2309.02395','rom_sha256':digest,
              'suite_sha256':hashlib.sha256(GOLDEN.read_bytes()).hexdigest(),
              'cases':len(suite),'seed':args.seed,'mutator':'conditional branch inversion and immediate operand bit-0 flip',
              'sampling':'up to per-region sites for EACH operator, without conditioning on coverage or detection',
              'per_region':args.per_region,'scope':'sampled ROM-page analysis; no equivalence exclusions',
              'overall':overall,'regions':regions,'faults':faults}
    if args.previous:
        previous = json.loads(args.previous.read_text())
        sample = lambda r: [(f['id'],f['before'],f['after']) for f in r['faults']]
        if previous['rom_sha256']!=digest or sample(previous)!=sample(report):
            raise RuntimeError('previous report must use the same ROM and exact mutation sample')
        fields = ['coverage_percent','raw_mutation_score_percent','covered_mutation_score_percent',
                  'raw_oracle_gap_pp','covered_oracle_gap_pp']
        delta = lambda before,after: {key:round(after[key]-before[key],2)
                  if before[key] is not None and after[key] is not None else None for key in fields}
        old_regions = {r['region']:r for r in previous['regions']}
        report['change'] = {'previous_cases':previous['cases'],'current_cases':len(suite),
                          'previous_suite_sha256':previous['suite_sha256'],
                          'overall_delta_pp':delta(previous['overall'],overall),
                          'regions_delta_pp':{r['region']:delta(old_regions[r['region']],r) for r in regions},
                          'newly_detected':[f['id'] for f,old in zip(faults,previous['faults']) if f['detected'] and not old['detected']],
                          'lost_detections':[f['id'] for f,old in zip(faults,previous['faults']) if old['detected'] and not f['detected']]}
    (ROOT/'build/oracle-gap.json').write_text(json.dumps(report,indent=2)+'\n')
    lines = ['# Sampled oracle-gap report','',
             'Inspired by [Mind the Gap](https://arxiv.org/pdf/2309.02395).', '',
             f'{len(suite)} cases; {len(faults)} branch/immediate mutants; seed {args.seed}.', '',
             'Raw gap = instruction coverage minus raw mutation score. Covered gap = instruction coverage minus mutation score restricted to covered sites. Gaps are percentage points, not percentages of verified code.', '',
             'The sample uses branch inversion and immediate-operand bit-0 changes. Surviving covered mutants need manual review for missing checks, missing input partitions, or equivalent behavior. No survivor has been silently excluded. Regions without mutants have no mutation score.', '',
             '| ROM region | Instruction coverage | Raw score | Covered score | Raw gap | Covered gap | Sample size | Next action |',
             '| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |']
    def value(v): return '—' if v is None else f'{v:.2f}'
    for r in regions:
        lines.append('| '+ ' | '.join([r['region'],value(r['coverage_percent']),value(r['raw_mutation_score_percent']),
            value(r['covered_mutation_score_percent']),value(r['raw_oracle_gap_pp']),value(r['covered_oracle_gap_pp']),
            str(r['sampled_mutants']),r['recommendation']])+' |')
    lines += ['', '## Covered survivors','']
    for f in faults:
        if f['covered'] and not f['detected']:
            lines.append(f'- {f["id"]}: `{f["instruction"]}`; {f["covering_cases"]} covering cases all evaluated; requires review.')
    if not overall['covered_survivors']: lines.append('None in this sample. This does not establish complete oracle adequacy.')
    if 'change' in report:
        change = report['change']
        lines += ['', '## Paired suite comparison','',
                  f'Cases: {change["previous_cases"]} → {change["current_cases"]}; identical ROM and exact mutations.',
                  f'New detections: {", ".join(change["newly_detected"]) or "none"}.',
                  f'Lost detections: {", ".join(change["lost_detections"]) or "none"}.',
                  f'Overall metric changes (percentage points): `{json.dumps(change["overall_delta_pp"],sort_keys=True)}`.']
    lines += ['', '## Reproduction','', '`make oracle-gap` refreshes passing coverage and reruns the fixed sample. No golden transcripts or reference ROM bytes are rewritten. The JSON report contains mutation patches, witnesses, detector types, and reasons.', '']
    (ROOT/'build/oracle-gap.md').write_text('\n'.join(lines))
    print(json.dumps(overall,indent=2),flush=True)


if __name__ == '__main__': main()
