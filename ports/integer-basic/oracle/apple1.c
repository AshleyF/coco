/* Minimal Apple-1 console adapter around the unmodified bsoz 6502 core.
 * Runs an external 4K BASIC image, using actual emulated PIA accesses.
 * Input is fetched only at BASIC's blocking RDKEY entry; this prevents
 * preloaded future commands from being mistaken for RUN's break key. */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "vendor/bsoz.h"
#include "vendor/wozmon.h"

static uint8_t memory[65536], pending;
static unsigned long instructions;
static unsigned long budget = 100000000;
static unsigned long hits[4096], reads[4096];
static unsigned long branches[4096][2]; /* not taken, taken */
static const char *coverage_path;
static const char *key_after_output;
static char key_tail[256];
static size_t key_tail_length, key_anchor_length;
static unsigned int event_key;
static int key_ready, key_delivered;

static void save_coverage(void) {
    unsigned int i;
    FILE *out;
    if (!coverage_path) return;
    out = fopen(coverage_path, "w");
    if (!out) { perror(coverage_path); exit(1); }
    fprintf(out, "{\"instructions\":%lu,\"hits\":[", instructions);
    for (i = 0; i < 4096; i++) fprintf(out, "%s%lu", i ? "," : "", hits[i]);
    fprintf(out, "],\"reads\":[");
    for (i = 0; i < 4096; i++) fprintf(out, "%s%lu", i ? "," : "", reads[i]);
    fprintf(out, "],\"branches\":{");
    int first = 1;
    for (i = 0; i < 4096; i++) {
        if (!branches[i][0] && !branches[i][1]) continue;
        fprintf(out, "%s\"%04X\":[%lu,%lu]", first ? "" : ",",
                i + 0xe000, branches[i][0], branches[i][1]);
        first = 0;
    }
    fprintf(out, "}}\n");
    if (fclose(out)) { perror(coverage_path); exit(1); }
}

uint8_t r8(struct cpu *cpu, uint16_t address) {
    if (address == 0xd011) {
        if (key_ready && !key_delivered && !pending) {
            pending = (uint8_t)(event_key | 0x80);
            key_delivered = 1;
        }
        if (!pending && cpu->pc == 0xe006) {
            int key = getchar();
            if (key == EOF) {
                if (ferror(stdin)) { perror("stdin"); exit(1); }
                exit(0); /* Finished transcript, BASIC requesting another key. */
            }
            if (key >= 'a' && key <= 'z') key -= 'a' - 'A';
            if (key == '\n') key = '\r';
            pending = (uint8_t)(key | 0x80);
        }
        return pending ? 0x80 : 0;
    }
    if (address == 0xd010) {
        uint8_t result = pending;
        pending = 0;
        return result;
    }
    if (address == 0xd012) return 0; /* Console ready immediately. */
    if (address >= 0xe000 && address < 0xf000) reads[address - 0xe000]++;
    return memory[address];
}

uint8_t w8(struct cpu *cpu, uint16_t address, uint8_t value) {
    (void)cpu;
    if (address == 0xd012) {
        int ch = value & 0x7f;
        if (ch == '\r') ch = '\n';
        if (key_after_output && !key_ready) {
            if (key_tail_length == key_anchor_length) {
                memmove(key_tail, key_tail + 1, key_anchor_length - 1);
                key_tail_length--;
            }
            key_tail[key_tail_length++] = (char)ch;
            if (key_tail_length == key_anchor_length &&
                    memcmp(key_tail, key_after_output, key_anchor_length) == 0)
                key_ready = 1;
        }
        if (putchar(ch) == EOF || fflush(stdout) == EOF) {
            perror("stdout"); exit(1);
        }
    } else if (address < 0x1000 ||
               (address >= 0xd010 && address <= 0xd013)) {
        memory[address] = value;
    }
    return value;
}

int main(int argc, char **argv) {
    struct cpu cpu = {0};
    FILE *rom;
    size_t size;
    if (argc < 2 || argc > 3) {
        fprintf(stderr, "usage: %s basic.bin [instruction-budget] < commands.bas\n", argv[0]);
        return 1;
    }
    if (argc == 3) {
        char *end;
        budget = strtoul(argv[2], &end, 10);
        if (!budget || *end) { fprintf(stderr, "invalid budget\n"); return 1; }
    }
    key_after_output = getenv("BASIC_KEY_AFTER_OUTPUT");
    const char *key_text = getenv("BASIC_KEY_BYTE");
    if (key_after_output || key_text) {
        char *end;
        if (!key_after_output || !key_text || !(key_anchor_length = strlen(key_after_output)) ||
                key_anchor_length >= sizeof(key_tail)) {
            fprintf(stderr, "key event requires a nonempty output anchor below 256 bytes and an ASCII key\n");
            return 1;
        }
        event_key = (unsigned int)strtoul(key_text, &end, 10);
        if (*end || !event_key || event_key > 127) {
            fprintf(stderr, "event key must be ASCII 1..127\n");
            return 1;
        }
    }
    rom = fopen(argv[1], "rb");
    if (!rom) { perror(argv[1]); return 1; }
    size = fread(memory + 0xe000, 1, 4096, rom);
    if (size != 4096 || fgetc(rom) != EOF || ferror(rom)) {
        fprintf(stderr, "BASIC image must be exactly 4096 bytes\n");
        fclose(rom); return 1;
    }
    fclose(rom);
    memcpy(memory + 0xff00, wozmon, sizeof(wozmon));
    coverage_path = getenv("APPLE1_COVERAGE");
    if (coverage_path) atexit(save_coverage);
    rst(&cpu);
    cpu.pc = 0xe000; /* Direct cold entry, avoiding monitor command injection. */
    while (instructions++ < budget) {
        uint16_t pc = cpu.pc;
        if (pc >= 0xe000 && pc < 0xf000) hits[pc - 0xe000]++;
        if (step(&cpu) < 0) {
            fprintf(stderr, "unsupported opcode at $%04X\n", pc); return 1;
        }
        /* All eight official conditional branch opcodes end in $10 and have
         * a two-byte encoding. A zero displacement has identical destination
         * PCs; there are no such branches in the selected image. */
        if (pc >= 0xe000 && pc < 0xf000 && (memory[pc] & 0x1f) == 0x10) {
            branches[pc - 0xe000][cpu.pc != (uint16_t)(pc + 2)]++;
        }
    }
    fprintf(stderr, "instruction budget exhausted at $%04X\n", cpu.pc);
    return 2;
}
