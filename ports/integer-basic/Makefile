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

build/runtime-prototype.asm: native/original-runtime/build.py build/a1basic.lst reference/a1basic.s reference/a1basic.bin
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
	node native/cassette.test.mjs
	node native/platform.test.mjs
	node native/cycles.test.mjs

.PHONY: native-behavior-test
native-behavior-test: all verify native
	python3 oracle/behavior.py compare --runner 'node native/runner.mjs' --artifact build/prompt.bin --report build/native-acceptance.json
	python3 native/report.py

.PHONY: native-full-test
native-full-test: native-behavior-test

.PHONY: demos demo-test
demos: build/blackjack.cas build/blackjack.wav

build/blackjack.asm build/blackjack.ram &: demos/build.mjs demos/blackjack.bas build/prompt.bin
	node demos/build.mjs

build/blackjack.bin: build/blackjack.asm build/blackjack.ram
	$(LWASM) --6809 --format=decb --output=$@ build/blackjack.asm

build/blackjack.cas: build/blackjack.bin native/cassette.mjs ../../cassette.js
	node native/cassette.mjs $< $@

build/blackjack.wav: build/blackjack.bin native/cassette.mjs ../../cassette.js
	node native/cassette.mjs $< $@

demo-test: all verify native demos
	python3 demos/test.py
	node demos/cassette.test.mjs

.PHONY: native-fsk-test verify-native
native-fsk-test: native
	node ../../tests/cassette-rom.test.node.mjs
	BASIC_TAPE_MODE=cas node native/cassette.test.mjs
	BASIC_TAPE_MODE=pcm node native/cassette.test.mjs

verify-native: native-test native-behavior-test native-fsk-test demo-test

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
