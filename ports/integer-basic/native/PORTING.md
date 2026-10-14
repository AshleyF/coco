# Native 6809 port: expressions, scalars, stored programs, and branches

`prompt.asm` builds a native 6809E application with entry at `$3000` and program-handling code at `$2000`. `make native` packages it as `build/prompt.cas` for CLOADM/EXEC; the DECB binary is retained for internal tests. It runs in the shared CoCo emulator using initialized Color BASIC's KEYIN and CHROUT vectors, and requires at least 32K RAM. Stack: `$7F00`. Scalar storage: `$4000-$4033`; token/render buffers: `$4800`/`$4900`; program arena: `$5000-$6FFF`. No 6502 emulator, Apple ROM, or host BASIC implementation is present in this binary.

## Implemented behavior

- Cold initialization, prompt and logical newline conventions, immediate-mode error recovery.
- Uppercase keyboard normalization, underscore deletion, ESC line cancellation, and bounded line input. Physical CoCo backspace is accepted as an underscore-delete alias.
- PRINT of quoted strings and integer expressions, comma/semicolon separators, TAB, empty PRINT, and empty lines.
- Numbered program insertion, replacement and deletion, LIST/DEL with inclusive line selectors, SCR, and sequential RUN with optional start line. RUN clears scalars; END stops execution, REM ignores its tail, and colon-separated statements execute in order. Runtime errors report the stopped line.
- GOTO with computed target, IF with numeric conditions and a literal-line or statement consequent, nested IF, and conditional END. Taken branches skip later colon statements; false IF skips only its consequent. GOTO preserves scalars while RUN clears them.
- Parentheses, unary signs, + / - / * / division / MOD, all numeric comparison spellings, AND / OR / NOT, ABS, and SGN.
- Single-letter scalar variables A-Z, implied/LET assignment, default zero values, and CLR. Scalars occupy $4000-$4033 as explicit LE bytes.
- Decimal output from 0 through 32767 and negative literals down to -32767, including zero and leading-zero normalization.
- Literal-range and basic syntax diagnostics, followed by another usable prompt.

The current native precedence parser evaluates source text rather than the original syntax-table token stream. The supported grammar is tokenized into compact native records with little-endian line numbers and numeric operands; LIST and RUN render those records back into source. Native token IDs and record layouts differ from Apple's. Multi-letter/dynamic variable storage, arrays, string variables, AUTO, and loop/subroutine control flow remain incomplete. Valid commands outside this milestone can currently produce SYNTAX errors. Passing the current projection is not evidence of full parser fidelity. Multiplication/division currently use bounded repeated arithmetic rather than optimized bit algorithms.

## Original-source correspondence

| Native path | Reference source | Current adaptation |
| --- | --- | --- |
| cold/new_cmd/clr_cmd | cold, mem_init_4k, new_cmd, clr | Private relocated storage and stack; original LE memory-pointer byte layout retained. CLR also clears the current scalar block. SCR clears program storage and scalars; CLR retains the program. |
| warm/prompt | warm and Le2b6 | Successful statements enter warm and emit an extra CR; immediate errors enter prompt directly. |
| rdkey/read_line | rdkey and Le280/read_line | CoCo KEYIN ABI, uppercase conversion, Apple editing characters and line buffer. |
| cout/crout | cout/crout | CoCo CHROUT ABI; retain logical output before host wrapping and scrolling. |
| parse_integer | literal recognition through put_token/decimal accumulation | Bounded decimal conversion and native numeric tokens with LE operands; original syntax-table architecture remains pending. |
| parse_sum/parse_term/signed_math | add, subtract, mult_op, divide, mod_op | Native signed 16-bit arithmetic, overflow checks, and original XOR sign convention for quotient/remainder. |
| parse_compare/parse_unary | eq_op, neq_op, comparison paths, negate, abs_fn, sgn_fn, not_op | Normalized 0/1 predicates, precedence and checked arithmetic. |
| scalar assignment/load | var_assign and execute_var | Current A-Z scalar block uses LE byte storage; original variable-record allocation is pending. |
| tokenize/render_tokens/edit_line | put_token, LIST and program editing | Native compact sorted records; replacement/deletion preserve neighboring records. LIST normalizes literals and keywords and reproduces continuation wrapping. |
| command_run/execute_source | run_cmd and statement execution | Sequential execution, optional start line, colon splitting, END, REM, GOTO/IF, and stopped-line diagnostics; loop/subroutine stacks pending. |
| prdec | prdec and decimal place tables | Native 16-bit register arithmetic with a decimal place scan and suppressed leading zeroes. |
| parse_string/emit_literal | string literal and print_str paths | Bounded quoted-string span, validated before output; full string storage/subscript handling pending. |
| report_error | print_err_msg and immediate recovery | Current SYNTAX and >32767 messages, preserved CR/prompt order. |

6809 registers and instruction addresses use their normal conventions. Existing original-layout workspace fields are explicit little-endian bytes. Native-only scratch words and pointers ending in `_be` use native word accesses; these are not aliases of the original interpreter's integer structures.

## Reusable acceptance pipeline

`runner.mjs` boots the actual CoCo ROMs, loads `build/prompt.bin`, and executes the shared MC6809 CPU. It supplies ASCII keys at KEYIN's ABI entry and observes the native cout routine before screen presentation. CHROUT still runs in the CoCo ROM. JavaScript performs no parsing, integer conversion, expression evaluation, or command execution.

The runner accepts stdin and emits the complete logical console transcript on stdout. EOF completes only when the native program requests another key. Exhausting the native instruction budget returns status 2. This is deterministic console testing; asynchronous BREAK and keyboard timing are separate future contracts.

```sh
make native-test           # Internal loader, scalar layout, and real ROM CLOADM/EXEC with keyboard PRINT
make native-behavior-test  # 633 expression/scalar contracts + 126 stored-program/branch contracts
make native-full-test      # Completion gate: currently 107 failures
node native/runner.mjs < commands.bas
```

The native milestone uses the same `behavior.jsonl`, explicit expectations, exact transcripts, and comparator as the original. `--feature` and `--case` select a milestone projection in compare mode; recording a filtered baseline is forbidden, empty selections fail, and filtered runs do not overwrite the whole-suite coverage report. Compare without filters to assess the whole interpreter; the current slice still fails cases for unimplemented features. `--report build/native-acceptance.json` writes per-case progress without updating expected results. Unknown selectors and attempts to overwrite frozen baselines with reports are rejected.

Additional `literal-console` cases were first checked and recorded against the unchanged original ROM. They exercise decimal-place and sign boundaries, strings/punctuation, literal errors and recovery, lowercase input, deletion/cancellation, and empty input/PRINT. They remain part of the common suite for later port stages.

## Try it in the web emulator

Build with `make native`. Boot the CoCo to `OK`, use Tape to select `ports/integer-basic/build/prompt.cas`, then enter:

```basic
CLOADM
EXEC
```

At the Integer BASIC prompt, try:

```basic
PRINT "HELLO WORLD"
PRINT 6*7
A=256
PRINT A/2
PRINT 32768
PRINT 7
10 A=6*7
20 PRINT A
30 END
LIST
RUN
SCR
10 A=0
20 A=A+1
30 IF A<3 THEN 20
40 PRINT A
50 END
RUN
```

The arithmetic produces 42 and 128; the final conditional-branch program prints 3. The range-error command demonstrates error handling, and the following PRINT demonstrates recovery. Reset returns to Color BASIC. The cassette test loads every assembled segment through Color BASIC's CLOADM routine, executes through EXEC, and types PRINT using the keyboard matrix. The emulator uses its existing cassette ROM shortcuts; physical tape timing and real hardware remain unverified. The DECB binary is retained for internal tests.

Next substantial translation: loop/subroutine control flow, then dynamic variable/string/array records. Preserve the 759 gated contracts while enlarging the native acceptance projection. Full-suite progress is separate from the gated milestone; passing counts are not a percentage of interpreter fidelity.

## Measured progress

The latest full comparison passes **766/873** contracts and fails **107/873**. All 759 gated expression/scalar and stored-program/branch contracts pass. The full report is [native-acceptance.md](../build/native-acceptance.md), with per-case evidence in `build/native-acceptance.json`. These counts are not instruction coverage or a fidelity percentage. Loops/subroutines, dynamic variable storage, arrays, string variables, INPUT, AUTO, and RND remain incomplete. The original 873-case oracle still passes, and its two CPU implementations agree.
