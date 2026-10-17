# Independent CoCo validation

`make native-xroar-test` runs the released interpreter in XRoar, independently of
this repository's JavaScript 6809 CPU and machine. Both the CAS and WAV are loaded
using Color BASIC's CLOADM; EXEC starts the application. Tape acceleration and
automatic CAS leader padding are disabled. The stored-program test types source
before RUN, then leaves the keyboard queue empty while it executes.

The test checks every loaded code/data segment byte for byte, PRINT results,
arrays, string contents, conditional flow, FOR/NEXT and GOSUB/RETURN. A native
POKE marker is computed from array values. XRoar's own command-entry facility
supplies keyboard bytes; it does not replace the native BASIC evaluator.
Four runs cover the console and stored-program scenarios on CAS and WAV.
`build/xroar-acceptance.json` records binary/image fingerprints, commands,
screens and emulator version. Snapshots and logs are in `build/xroar-*`.

The verified emulator is [XRoar 1.12.1](https://www.6809.org.uk/xroar/), built from
the [official source archive](https://www.6809.org.uk/xroar/dl/xroar-1.12.1.tar.gz).
Archive SHA-256:

```text
ba525225fbd732c4dbf2cbb571dc9d2810fd9dcedf0482133cf637e2eef61f88
```

An ignored local `.tools/xroar` binary is available on this workstation.
Alternatively supply a path: `make native-xroar-test XROAR=/path/to/xroar`.
For a headless source build, unpack the archive and run:

```sh
./configure --without-gtk3 --without-gtk2 --without-gtkgl \
  --without-sdl3 --without-sdl2 --without-cocoa --without-alsa \
  --without-oss --without-pulse --without-coreaudio \
  --without-libpng --without-zlib
make -j4
```

The executable is `src/xroar`. The build includes a native WAV reader without
requiring libsndfile. XRoar is GPL-3.0-or-later; source and license are available
from its official site. No XRoar code is linked into the CoCo application.

This test adds an independent CPU, machine, cassette decoder and audio reader.
It does not claim electrical playback on a physical CoCo or universal language
equivalence. The full 931-case behavioral suite and 1,558-case parser matrix run
separately against the released binary in this repository's emulator.
