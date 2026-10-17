# Integer BASIC program tapes (CoCo extension)

At the Integer BASIC `>` prompt:

```basic
SAVE "MYGAME"
LOAD "MYGAME"
```

Names are one to eight non-space characters in quotes; keyboard input is uppercased. `SAVE` without a name uses
`PROGRAM`; `LOAD` without a name accepts the next file regardless of its name.
The commands must occupy their own prompt line. Numbered programs, INPUT and
AUTO retain the original parser and do not interpret these extensions.

## Web emulator

First load the current `build/prompt.cas` (or `blackjack.cas`) using **Tape**,
then `CLOADM` and `EXEC` at CoCo BASIC's `OK` prompt.

To save your Integer BASIC program:

1. Click **⏺** to arm recording.
2. Type `SAVE "MYGAME"` at `>` and wait for `SAVED`.
3. Click **⏺** again to stop recording, then **CAS** or **WAV** to download it.

To restore it, select the saved file with **Tape**, type `LOAD "MYGAME"`,
and wait for `LOADED`. You can then `LIST` or `RUN`. Use `SCR` to clear a
program manually; this Apple-1 dialect does not spell that command `NEW`.

These program files do not contain the interpreter. Start Integer BASIC first,
then use `LOAD`; do not use CoCo BASIC's `CLOAD` or `CLOADM` on them. Loading
clears variables and loop/subroutine state, while preserving the current
LOMEM/HIMEM settings. Saving preserves variables but does not store them.

## Limits and recovery

The 32K build stages incoming files at `$7000..$7DFF` before replacing the
current program. Program tapes are limited to **3,584 tokenized bytes**, enough
for any program fitting the default 2 KiB arena. Programs using an expanded
HIMEM can exceed that limit and will receive `TAPE TOO LARGE`. The destination
must also fit between the current LOMEM and HIMEM.

Checksum, format, capacity, name and record-framing errors leave the existing
program and variables intact. A name mismatch reports `TAPE NAME ERR` rather
than searching subsequent files; remount the desired file to rewind it.
Like CoCo's low-level cassette routines, `LOAD` waits for a signal if the tape
is absent or ends prematurely; Reset cancels that wait and restarts the machine.
There is no software timeout or BREAK cancellation during ROM tape input.

For an existing historical game, `make demos` builds `blackjack-program.cas`
and `.wav`. Start the interpreter, mount the program tape, then type
`LOAD "BLACKJAK"` and `RUN`. The [demo walkthrough](../demos/README.md) also
covers saving your own copy and reloading it after `SCR`.

## File format and implementation

`native/tape.asm` uses native 6809 code and stock Color BASIC cassette vectors
`[$A004]`, `[$A006]`, `[$A008]`, `[$A00C]`. It uses the existing cassette deck;
no emulator-specific BASIC file service or new loading button is required.
The ROM calling convention was checked against the
[Color BASIC 1.3 disassembly](https://github.com/tomctomc/coco_roms/blob/master/bas.asm).

The file consists of standard CoCo cassette blocks with their normal checksums:

| Block | Contents |
| --- | --- |
| Header, type 0, 15 bytes | Eight-character padded name, file type 1 (data), binary and continuous flags, four zero address bytes |
| Metadata, type 1, 8 bytes | ASCII `WIB1`, program length (BE uint16), sum of all payload bytes modulo 65536 (BE uint16) |
| Payload, type 1 | Original tokenized line records in blocks of up to 255 bytes; numeric operands/line numbers remain LE |
| EOF, type 255 | Zero-length block |

LOAD checks the version, lengths, checksums, increasing line numbers, record
bounds and terminating tokens before copying staged bytes below HIMEM. No
interpreter or absolute pointers are read from the tape. This is corruption
detection, not authentication of untrusted programs: BASIC's POKE/CALL remain
available to a loaded program.

The extension occupies `$4400..$4BFF`; its state is in `$4308..$4375`, and its
block buffer is `$4E00..$4EFF`. These are outside the original private workspace,
grammar, program arena and stack. Temporary CoCo cassette workspace is restored.

`make native-test` includes a native SAVE/SCR/LOAD round trip, exact token bytes,
LIST/RUN, variables cleared on success/preserved on failure, empty and multi-block
files, malformed files, and CAS/actual PCM input with tape shortcuts disabled.
`make native-xroar-test` additionally records SAVE through independent XRoar's
ROM/DAC into a WAV, then loads that actual waveform and runs its program.
Physical cassette cable recording/playback on a real CoCo is still unverified.
