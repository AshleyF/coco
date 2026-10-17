CC ?= cc
CFLAGS ?= -O2 -Wall -Wextra
CA65 ?= $(if $(wildcard .tools/ca65),.tools/ca65,ca65)
LD65 ?= $(if $(wildcard .tools/ld65),.tools/ld65,ld65)

.PHONY: all verify run test cpu-test clean
all: build/apple1 build/a1basic.bin

build:
	mkdir -p build

build/apple1: oracle/apple1.c oracle/vendor/bsoz.h oracle/vendor/wozmon.h | build
	$(CC) $(CFLAGS) oracle/apple1.c -o $@

build/a1basic.o: reference/a1basic.s | build
	$(CA65) -g -l build/a1basic.lst -o $@ $<

build/a1basic.bin: build/a1basic.o reference/basic.cfg
	$(LD65) -C reference/basic.cfg -m build/a1basic.map -o $@ $<

verify: build/a1basic.bin
	cmp reference/a1basic.bin build/a1basic.bin

run: all verify
	./build/apple1 build/a1basic.bin

test: all verify cpu-test behavior-test targeted-test mutation-test
	python3 oracle/test.py

clean:
	rm -rf build

build/cpu-test: oracle/vendor/bsoztest.c oracle/vendor/bsoz.h | build
	$(CC) $(CFLAGS) -Ioracle/vendor $< -o $@

cpu-test: build/cpu-test
	cp oracle/vendor/6502-functional-test.bin build/test.bin
	cd build && ./cpu-test

LWASM ?= $(if $(wildcard .tools/lwasm),.tools/lwasm,lwasm)
.PHONY: native native-test
native: build/prompt.bin build/prompt.cas build/prompt.wav

build/prompt.cas: build/prompt.bin native/cassette.mjs ../../cassette.js
	node native/cassette.mjs $< $@

build/prompt.wav: build/prompt.bin native/cassette.mjs ../../cassette.js
	node native/cassette.mjs $< $@

build/original-parser.inc: native/parser-build.py reference/a1basic.s reference/a1basic.bin | build
	python3 native/parser-build.py

build/parser-prototype.bin: build/original-parser.inc
	$(LWASM) --6809 --format=decb --symbol-dump=build/parser-prototype.sym --output=$@ build/parser-prototype.asm

.PHONY: native-parser-test
native-parser-test: all verify build/parser-prototype.bin
	python3 native/parser-prototype.test.py

build/runtime-prototype.asm: native/original-runtime/build.py native/original-runtime/flags.py native/tape.asm build/a1basic.lst reference/a1basic.s reference/a1basic.bin
	python3 native/original-runtime/build.py

build/a1basic.lst: build/a1basic.o
	@test -f $@

build/runtime-prototype.bin: build/runtime-prototype.asm
	$(LWASM) --6809 --format=decb --symbol-dump=build/runtime-prototype.sym --output=$@ $<

.PHONY: native-original native-original-test
native-original: all verify build/runtime-prototype.bin

native-original-test: native-original
	node native/original-runtime/platform.test.mjs
	node native/original-runtime/cassette.test.mjs
	python3 oracle/behavior.py compare --runner 'node native/original-runtime/runner.mjs' --artifact build/runtime-prototype.bin --report build/native-original-runtime.json
	python3 demos/test.py --runner 'node native/original-runtime/runner.mjs'

build/prompt.bin: build/runtime-prototype.asm
	$(LWASM) --6809 --format=decb --list=build/prompt.lst --symbol-dump=build/prompt.sym --output=$@ $<

.PHONY: native-handwritten
native-handwritten: build/handwritten.bin

build/handwritten.bin: native/prompt.asm native/expressions.asm native/programs.asm native/storage.asm native/io.asm native/memory.asm build/original-parser.inc | build
	$(LWASM) --6809 --format=decb --symbol-dump=build/handwritten.sym --output=$@ $<

native-test: all verify native
	python3 native/parser-prototype.test.py --runner 'node native/original-runtime/parser.mjs' --report build/native-original-parser.json
	node native/test.mjs
	node native/layout.test.mjs
	node native/internal-memory.test.mjs
	node native/cassette.test.mjs
	node native/platform.test.mjs
	node native/cycles.test.mjs
	node native/tape.test.mjs

.PHONY: native-behavior-test
native-behavior-test: all verify native
	python3 oracle/behavior.py compare --runner 'node native/runner.mjs' --artifact build/prompt.bin --report build/native-acceptance.json
	python3 native/report.py

.PHONY: native-full-test
native-full-test: native-behavior-test

.PHONY: demos demo-test
demos: star-trek build/blackjack.cas build/blackjack.wav build/blackjack-program.cas build/blackjack-program.wav

build/blackjack-program.cas build/blackjack-program.wav: demos/program-tape-build.mjs demos/blackjack.bas build/prompt.bin native/runner.mjs native/console-runner.mjs ../../coco-machine.js ../../cassette.js
	node demos/program-tape-build.mjs $@

build/blackjack.asm: demos/build.mjs demos/blackjack.bas build/prompt.bin
	node demos/build.mjs

build/blackjack.bin: build/blackjack.asm
	$(LWASM) --6809 --format=decb --output=$@ build/blackjack.asm

build/blackjack.cas: build/blackjack.bin native/cassette.mjs ../../cassette.js
	node native/cassette.mjs $< $@

build/blackjack.wav: build/blackjack.bin native/cassette.mjs ../../cassette.js
	node native/cassette.mjs $< $@

demo-test: all verify native demos
	python3 demos/test.py
	node demos/cassette.test.mjs
	node demos/program-tape.test.mjs
	node demos/star-trek.test.mjs

.PHONY: native-fsk-test verify-native
native-fsk-test: native
	node ../../tests/cassette-rom.test.node.mjs
	BASIC_TAPE_MODE=cas node native/cassette.test.mjs
	BASIC_TAPE_MODE=pcm node native/cassette.test.mjs

verify-native: native-test native-behavior-test native-fsk-test demo-test

XROAR ?= $(if $(wildcard .tools/xroar),.tools/xroar,xroar)
.PHONY: native-xroar-test
native-xroar-test: native
	python3 native/xroar.test.py --xroar "$(XROAR)"
	python3 native/tape-xroar.test.py --xroar "$(XROAR)"
	BASIC_EXTERNAL_PROGRAM_WAV=build/xroar-program.wav node native/tape.test.mjs

.PHONY: native-benchmark native-performance-check
native-benchmark: all verify native
	node native/benchmark.mjs --baseline native/performance-baseline.json

# Capture build/perf-before.bin/.sym and perf-before.json before optimization.
native-performance-check: all verify native
	node native/translation-equivalence.test.mjs
	node native/benchmark.mjs --baseline build/perf-before.json

.PHONY: golden-record golden-test
golden-record: all verify
	python3 oracle/golden.py record

golden-test: all verify
	python3 oracle/golden.py compare

.PHONY: targeted-test
targeted-test: all verify
	python3 oracle/targeted.py

.PHONY: behavior-record behavior-test
behavior-record: all verify
	python3 oracle/behavior.py record

behavior-test: all verify
	python3 oracle/behavior.py compare

.PHONY: mutation-test
mutation-test: all verify
	python3 oracle/mutations.py

.PHONY: exploratory-audit
exploratory-audit: all
	python3 oracle/audit.py

.PHONY: oracle-crosscheck
oracle-crosscheck: all verify
	python3 oracle/crosscheck.py

.PHONY: verify-oracle
verify-oracle: test oracle-crosscheck oracle-gap

.PHONY: oracle-gap
oracle-gap: behavior-test
	python3 oracle/oracle_gap.py

# Static website assets are tracked separately from ignored build diagnostics.
.PHONY: web-software
web-software: native-graphics build/blackjack-program.cas build/star-trek-program.cas
	mkdir -p ../../software
	cp build/graphics.cas ../../software/integer-basic.cas
	cp build/blackjack-program.cas ../../software/blackjack-program.cas
	cp build/star-trek-program.cas ../../software/star-trek-program.cas

.PHONY: star-trek star-trek-test
star-trek: build/star-trek.cas build/star-trek.wav build/star-trek-program.cas build/star-trek-program.wav

build/star-trek.asm: demos/star-trek-build.mjs demos/star-trek-source.mjs demos/star-trek.original.bas build/prompt.bin native/runner.mjs native/console-runner.mjs ../../coco-machine.js ../../cassette.js
	node demos/star-trek-build.mjs $@

build/star-trek.bin: build/star-trek.asm
	$(LWASM) --6809 --format=decb --output=$@ $<

build/star-trek.cas: build/star-trek.bin native/cassette.mjs ../../cassette.js
	node native/cassette.mjs $< $@

build/star-trek.wav: build/star-trek.bin native/cassette.mjs ../../cassette.js
	node native/cassette.mjs $< $@

build/star-trek-program.cas build/star-trek-program.wav: demos/star-trek-build.mjs demos/star-trek-source.mjs demos/star-trek.original.bas build/prompt.bin native/runner.mjs native/console-runner.mjs ../../coco-machine.js ../../cassette.js
	node demos/star-trek-build.mjs $@

star-trek-test: all verify native star-trek
	node demos/star-trek.test.mjs

.PHONY: native-graphics
native-graphics: all verify build/graphics.bin build/graphics.cas build/graphics.wav

build/graphics-runtime.asm: native/original-runtime/build.py native/original-runtime/flags.py native/tape.asm native/graphics-terminal.asm native/terminal-font.json build/a1basic.lst reference/a1basic.s reference/a1basic.bin
	python3 native/original-runtime/build.py --graphics

build/graphics-font.inc build/graphics-tape.inc: build/graphics-runtime.asm
	@test -f $@ || python3 native/original-runtime/build.py --graphics

build/graphics.bin: build/graphics-runtime.asm build/graphics-font.inc build/graphics-tape.inc
	$(LWASM) --6809 --format=decb --list=build/graphics.lst --symbol-dump=build/graphics.sym --output=$@ $<

build/graphics.cas: build/graphics.bin native/cassette.mjs ../../cassette.js
	node native/cassette.mjs $< $@

build/graphics.wav: build/graphics.bin native/cassette.mjs ../../cassette.js
	node native/cassette.mjs $< $@

.PHONY: graphics-demos graphics-test

.SECONDARY: build/graphics-blackjack.bin build/graphics-star-trek.bin

graphics-demos: build/graphics-blackjack.bin build/graphics-star-trek.bin native-graphics build/graphics-blackjack.cas build/graphics-blackjack.wav build/graphics-star-trek.cas build/graphics-star-trek.wav

build/graphics-blackjack.asm: demos/graphics-build.mjs demos/blackjack.bas build/graphics.bin
	node demos/graphics-build.mjs blackjack

build/graphics-star-trek.asm: demos/graphics-build.mjs demos/star-trek-source.mjs demos/star-trek.original.bas build/graphics.bin
	node demos/graphics-build.mjs star-trek

build/graphics-%.bin: build/graphics-%.asm
	$(LWASM) --6809 --format=decb --output=$@ $<

build/graphics-%.cas: build/graphics-%.bin native/cassette.mjs ../../cassette.js
	node native/cassette.mjs $< $@

build/graphics-%.wav: build/graphics-%.bin native/cassette.mjs ../../cassette.js
	node native/cassette.mjs $< $@

graphics-test: native-graphics graphics-demos build/blackjack-program.cas build/blackjack-program.wav build/star-trek-program.cas build/star-trek-program.wav
	node native/graphics-terminal.test.mjs
	node native/internal-memory.test.mjs --graphics
	python3 native/parser-prototype.test.py --runner 'node native/original-runtime/parser.mjs --graphics' --report build/graphics-parser.json
	python3 oracle/behavior.py compare --runner 'node native/graphics-runner.mjs' --artifact build/graphics.bin --report build/graphics-acceptance.json
	node native/graphics-cassette.test.mjs
	node demos/program-tape.test.mjs --graphics
	node demos/star-trek.test.mjs --graphics

.PHONY: graphics-xroar-test
graphics-xroar-test: native-graphics
	python3 native/xroar.test.py --xroar "$(XROAR)" --graphics
	python3 native/tape-xroar.test.py --xroar "$(XROAR)" --graphics
	BASIC_EXTERNAL_PROGRAM_WAV=build/graphics-xroar-program.wav node native/graphics-cassette.test.mjs
