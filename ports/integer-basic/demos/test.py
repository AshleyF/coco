"""Historical game integration contracts, shared unchanged with native backends."""
import argparse
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
sys.path.insert(0, str(ROOT / 'oracle'))
from py65_runner import run
from golden import execute

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--runner', default='node demos/runner.mjs')
args = parser.parse_args()
subprocess.run([sys.executable, str(HERE/'recover-blackjack.py')], check=True)
source = (HERE/'blackjack.bas').read_text()
for name, moves, expected in [
    ('stand-and-quit', 'ASHLEY\n10\nN\n0\n',
     ['I SHOW  7S', 'YOU HAVE  KH  JS', 'I BUST, YOU WIN', 'WINNINGS: 10', 'END--STOPPED AT 30']),
    ('bet-limit-hit-and-quit', 'ASHLEY\n3500\n10\nY\n0\n',
     ['LIMIT IS $3000.', 'HIT?Y', 'BUSTED', 'I WIN', 'WINNINGS: -10', 'END--STOPPED AT 30']),
]:
    case = {'id': 'blackjack-'+name, 'input': source+'RUN\n'+moves, 'budget': 50_000_000}
    original = execute(case, None)
    assert original['status'] == 0 and 'ERR' not in original['output'], original
    for fragment in expected:
        assert fragment in original['output'], fragment
    assert run(case['input'], case['budget']) == original, 'Independent py65 mismatch'
    assert execute(case, args.runner) == original, 'Native transcript mismatch: '+name
    print(f'{name}: exact original / independent py65 / native transcript passed')
