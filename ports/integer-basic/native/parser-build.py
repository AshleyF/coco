"""Build an isolated native translation of the original table syntax recognizer.

The isolated harness checks exact tokens/errors before integration. This
translates the parser algorithm statically; the result
contains no instruction decoder or 6502 execution core. Reference attribution:
Wozniak BASIC; Eric Smith disassembly; Jeff Tranter ca65 adaptation.
"""
from pathlib import Path
import hashlib
import re

ROOT=Path(__file__).resolve().parents[1]
rom=(ROOT/'reference/a1basic.bin').read_bytes()
if hashlib.sha256(rom).hexdigest() != '5d8a3fe3c20c42903b226d67430c840ea5119557f88774c069e2e4dd80ad2c67':
    raise RuntimeError('Grammar translation requires the fingerprinted reference ROM')
source=(ROOT/'reference/a1basic.s').read_text()
body=source[source.index('Le3ed:  ROL'):source.index('\nprdec:')]
# The original parser uses overlapping byte arrays. Keep those aliases in a
# relocated private page; grammar page pointers are explicit LE byte pairs.
fields={'syn_stk_h':0x58,'syn_stk_l':0x80,'txtndxstk':0xa8,'text_index':0xc8,
        'leadbl':0xc9,'srch':0xd0,'tokndxstk':0xd1,'token_index':0xf1,
        'pcon':0xf2,'char':0xf9,'synstkdx':0xfd,'synpag':0xfe}
header=['; Generated native parser; see native/parser-build.py and reference/a1basic.s.',
        '; Apple-1 BASIC by Steve Wozniak; disassembly copyright 2003 Eric Smith.',
        '; Source adapted for ca65 by Jeff Tranter. Original grammar bytes are data.',
        '        org $0800','v_start lds #$7f00','        jsr v_validate',
        'v_test_done bra v_test_done','v_validate',
        '        ldx #$4f00','        ldb #0',
        'v_clear clr ,x+','        decb','        bne v_clear',
        '        sts v_saved_s_be','        lda v_input_count','        sta v_token_index',
        '        lda #$ff','        sta v_text_index','        ldb #$20',
        '        jsr v_Se491','        rts',
        'v_y equ $4f00','v_saved_s_be equ $4f01','v_error equ $4f03',
        'v_operand equ $4f04','v_input_count equ $4bff','v_buffer equ $4e00',
        'v_syntabl_index equ $4c20']
header += [f'v_{name} equ ${0x4f00+offset:04x}' for name,offset in fields.items()]
out=header[:]
def emit(*lines):out.extend('        '+s for s in lines)
def operand(s):
    s=s.replace('#(>syntabl_index)>>1','#$26')
    return re.sub(r'\b(buffer|syntabl_index|'+ '|'.join(fields)+r')\b',r'v_\1',s)
def get_a(s):
    if s=='(synpag),Y':emit('jsr v_get_page_y')
    elif s=='(synpag,X)':emit('jsr v_get_page_zero')
    elif s=='buffer,X':emit('jsr v_get_buffer_x')
    elif s.endswith(',Y'):
        target='v_index_positive_'+str(len(out))
        emit('pshs b,x','ldb v_y','ldx #'+operand(s[:-2]),'tstb','bpl '+target, 'leax 256,x')
        out.append(target)
        emit('lda b,x','puls b,x')
    elif s.endswith(',X'):emit('pshs x','ldx #'+operand(s[:-2]),'lda b,x','puls x')
    else:emit('lda '+operand(s))
def store_a(s):
    if s=='buffer,X':emit('jsr v_store_buffer_x')
    elif s.endswith(',X'):emit('pshs cc,x','ldx #'+operand(s[:-2]),'sta b,x','puls cc,x')
    else:emit('pshs cc','sta '+operand(s),'puls cc')
for line in body.splitlines():
    line=line.split(';')[0].strip()
    if not line:continue
    label=''
    if ':' in line:
        label,line=line.split(':',1);out.append('v_'+label.strip());line=line.strip()
    if not line:continue
    parts=line.split(None,1);op=parts[0];s=parts[1].strip() if len(parts)>1 else ''
    if op=='LDA':get_a(s)
    elif op=='STA':store_a(s)
    elif op=='LDX':emit('ldb '+operand(s))
    elif op=='STX':emit('pshs cc','stb '+operand(s),'puls cc')
    elif op=='LDY':emit('pshs a');get_a(s);emit('sta v_y','puls a')
    elif op=='STY':emit('pshs cc,a','lda v_y');store_a(s);emit('puls cc,a')
    elif op in ('INY','DEY'):emit(('inc' if op=='INY' else 'dec')+' v_y')
    elif op in ('INX','DEX'):emit('incb' if op=='INX' else 'decb')
    elif op in ('INC','DEC'):emit(op.lower()+' '+operand(s))
    elif op=='TAY':emit('sta v_y')
    elif op=='TYA':emit('lda v_y')
    elif op=='TAX':emit('tfr a,b','tstb')
    elif op=='TXA':emit('tfr b,a','tsta')
    elif op=='PHA':emit('pshs a')
    elif op=='PLA':emit('puls a','tsta')
    elif op in ('CMP','CPY'):
        if op=='CPY':emit('pshs a','lda v_y')
        if s=='buffer,X':
            emit('pshs a');get_a(s);emit('sta v_operand','puls a');s='v_operand'
        emit('cmpa '+operand(s),'jsr v_invert_carry')
        if op=='CPY':emit('puls a')
    elif op in ('ASL','LSR','ROL'):emit(op.lower()+'a')
    elif op in ('ADC','AND','ORA','EOR'):
        ins={'ADC':'adca','AND':'anda','ORA':'ora','EOR':'eora'}[op]
        if s=='(synpag),Y':emit('pshs a','jsr v_get_page_y',ins+' ,s+')
        else:emit(ins+' '+operand(s))
    elif op in ('BCC','BCS','BEQ','BNE','BPL','BMI'):emit('l'+op.lower()+' v_'+s)
    elif op in ('JMP','JSR'):emit(op.lower()+' v_'+s)
    elif op=='CLC':emit('andcc #$fe')
    elif op=='SEC':emit('orcc #1')
    elif op=='RTS':emit('rts')
    else:raise RuntimeError((op,s))
# Original put_token changes X and byte flags exactly as its source specifies.
out += ['v_too_long_err','        lda #6','        sta v_y','v_print_err_msg',
        '        lda v_y','        cmpa #6','        beq v_fail_long',
        '        cmpa #0','        beq v_fail_literal','        lda #1','        bra v_fail',
        'v_fail_long lda #9','        bra v_fail','v_fail_literal lda #2',
        'v_fail sta v_error','        lds v_saved_s_be','        rts',
        'v_get_page_y','        pshs b,x','        ldb v_synpag','        lda v_synpag+1',
        '        tfr d,x','        lda #0','        ldb v_y','        lda d,x',
        '        puls b,x,pc',
        'v_get_page_zero','        pshs b,x','        ldb v_synpag','        lda v_synpag+1',
        '        tfr d,x','        lda ,x','        puls b,x,pc',
        'v_get_buffer_x','        pshs x','        ldx #v_buffer','        tstb',
        '        bpl v_get_buffer_positive','        leax 256,x',
        'v_get_buffer_positive lda b,x','        puls x,pc',
        'v_store_buffer_x','        pshs cc,x','        ldx #v_buffer','        tstb',
        '        bpl v_store_buffer_positive','        leax 256,x',
        'v_store_buffer_positive sta b,x','        puls cc,x,pc',
        'v_invert_carry','        pshs a','        tfr cc,a','        eora #1',
        '        tfr a,cc','        puls a,pc',
        'v_code_end', '        org $4c00']
for i in range(0xc00,0xe00,16):
    out.append('        fcb '+','.join(f'${byte:02x}' for byte in rom[i:i+16]))
out += ['        end v_start','']
(ROOT/'build/parser-prototype.asm').write_text('\n'.join(out))
(ROOT/'build/original-parser.inc').write_text('\n'.join(out[:-2])+'\n')
