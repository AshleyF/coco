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
native: build/prompt.bin build/prompt.cas

build/prompt.cas: build/prompt.bin native/cassette.mjs ../../cassette.js
	node native/cassette.mjs $< $@

build/prompt.bin: native/prompt.asm native/expressions.asm native/programs.asm | build
	$(LWASM) --6809 --format=decb --list=build/prompt.lst --symbol-dump=build/prompt.sym --output=$@ $<

native-test: native
	node native/test.mjs
	node native/layout.test.mjs
	node native/cassette.test.mjs

.PHONY: native-behavior-test
native-behavior-test: all verify native
	python3 oracle/behavior.py compare --feature arithmetic --feature comparison --feature division --feature logic --feature literal-console --runner 'node native/runner.mjs'
	python3 oracle/behavior.py compare --case store-overwrite-and-clr --case syntax-errors-recover --case literal-range-and-recovery --case keyboard-delete-character --case escape-cancels-partially-typed-line --case arithmetic-errors-recover --case arithmetic-failure-preserves-state-0 --case arithmetic-failure-preserves-state-1 --case arithmetic-failure-preserves-state-2 --case arithmetic-failure-preserves-state-3 --case arithmetic-failure-preserves-state-4 --runner 'node native/runner.mjs'
	python3 native/programs.test.py

.PHONY: native-full-test
native-full-test: all verify native
	python3 oracle/behavior.py compare --runner 'node native/runner.mjs' --report build/native-acceptance.json

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
