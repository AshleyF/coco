# Website software library

These cassette images are served by the main page's Software library. They are
tracked website assets; the site works without `ports/integer-basic/build/`.

| File | Contents | Commands |
| --- | --- | --- |
| `integer-basic64.cas` | Native 64K build for the larger Mayfield game | Color BASIC: `CLOADM`, `EXEC` |
| `mayfield-program.cas` | Mike Mayfield HP Star Trek adapted to Integer BASIC | **64K** Integer BASIC: `LOAD "MIKETREK"`, `RUN` |
| `integer-basic.cas` | Native MC6809 Apple-1 Integer BASIC | Color BASIC: `CLOADM`, `EXEC` |
| `blackjack-program.cas` | Blackjack program only | Integer BASIC: `LOAD "BLACKJAK"`, `RUN` |
| `star-trek-program.cas` | Star Trek program only | Integer BASIC: `HIMEM=27904`, `LOAD "STARTREK"`, `RUN` |

The Forth library link uses the existing `carts/colorforth.ccc` cartridge and
`?cart=colorforth` startup route in a fresh tab.

Load Integer BASIC first with its application tape. Once its `>` prompt appears,
mount a game program tape and use `LOAD`. Wait for `OK` after `CLOADM` and
`LOADED` after `LOAD`. BASIC and games use separate tapes.

Regenerate all five cassettes after changing the native implementation or game:

```sh
make -C ports/integer-basic web-software
```

The source, provenance, behavioral checks and cassette format are documented in
[the port](../ports/integer-basic/README.md) and
[historical demos](../ports/integer-basic/demos/README.md). No separate BASIC
implementation is embedded in the website UI. Library tape buttons mount the
same cassette device as the local-file Tape button. Each click rewinds the tape;
it does not reset the machine or automatically enter commands.

To add software, add its packaged image here (or in `carts/`), a library entry in
`index.html`, and its tape metadata in `coco.js`. Include the appropriate loading
commands so program tapes and machine-code tapes remain distinguishable.

For Star Trek, see [the source history and commands](../ports/integer-basic/demos/STAR-TREK.md). Its exact source-code descent from Mayfield is not established.

The Integer BASIC application tape contains the [native 40×24 graphics-console build](../ports/integer-basic/native/GRAPHICS.md). Program-only tape bytes are unchanged. The retained ROM-console build uses a different workspace address.
