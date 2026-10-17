"""Experimental static MC6809 translation of the complete original BASIC engine.

No source-CPU interpreter/decoder is emitted. Original algorithms execute as
native assembly; console services and pointer layouts adapt to the CoCo.
Wozniak BASIC; disassembly copyright 2003 Eric Smith, ca65 by Jeff Tranter.
"""
from pathlib import Path
import re,hashlib,json,sys
GRAPHICS="--graphics" in sys.argv
from flags import analyze
ROOT=Path(__file__).resolve().parents[2]
rom=(ROOT/'reference/a1basic.bin').read_bytes()
assert hashlib.sha256(rom).hexdigest()=='5d8a3fe3c20c42903b226d67430c840ea5119557f88774c069e2e4dd80ad2c67'
source=(ROOT/'reference/a1basic.s').read_text()
constants={name:int(value,16) for name,value in re.findall(r'^(\w+)\s*=\s*\$([0-9A-Fa-f]+)',source,re.M)}
lines=[]; labels={}; instructions=set(); data=set(); sizes={}
for line in (ROOT/'build/a1basic.lst').read_text().splitlines():
    if not re.match(r'^[0-9A-F]{6}  1',line):continue
    address=int(line[:6],16)
    text=line[24:].split(';')[0].strip()
    if not text or '=' in text or text.startswith(('.org','.export')):continue
    label=''
    match=re.match(r'^(\w+):\s*(.*)',text)
    if match:label,text=match.groups();labels[label]=address
    if not text:
        lines.append((address,label,'',''));continue
    p=text.split(None,1);op=p[0];arg=p[1].strip() if len(p)>1 else ''
    if op=='.byte':data.update(range(address,address+len(arg.split(','))))
    else:
        instructions.add(address)
        sizes[address]=len(line[11:24].strip().split())
    lines.append((address,label,op,arg))
verb_entries={lo+256*hi for lo,hi in zip(rom[0xa10:0xa88],rom[0xa88:0xb00])}
live_in,live_out=analyze(lines,labels,sizes)
def needs(mask):return bool(live_out.get(current_address,15)&mask)
entries=set(labels.values())|verb_entries
for _,_,op,arg in lines:
    if op in ('JSR','JMP','BCC','BCS','BEQ','BNE','BPL','BMI','BVC','BVS'):
        m=re.fullmatch(r'(\w+)(?:([+-])(\d+))?',arg)
        if m and m[1] in labels:
            entries.add(labels[m[1]]+(int(m[3])*(1 if m[2]=='+' else -1) if m[3] else 0))
carry_mode=0  # 0: source carry; 1: native borrow (complement of source carry).
carry_entries={}
# Preserve original verb addresses as algorithm data. Native dispatch uses a
# second table, so incidental uses of the source address byte remain meaningful.
def address_expr(expr):
    expr=expr.strip('() ')
    m=re.fullmatch(r'(\w+)(?:([+-])(\d+))?',expr)
    if not m or m[1] not in labels:raise ValueError(expr)
    return labels[m[1]]+(int(m[3])*(1 if m[2]=='+' else -1) if m[2] else 0)
def byte(expr):
    expr=expr.strip()
    if expr.startswith(('<','>')):
        value=address_expr(expr[1:]);return f'${(value&255) if expr[0]=="<" else (value>>8):02x}'
    return expr
out=['; Experimental native translation of reference/a1basic.s.',
     '; BASIC by Steve Wozniak; disassembly copyright 2003 Eric Smith;',
     '; ca65 adaptation by Jeff Tranter. No 6502 decoder is present.',
     '        setdp $40','        org $0800','t_boot orcc #$50','        lds #$7f00',
     '        lda #$40','        tfr a,dp',
     '        ldu #$4080',
     '        ldx #$4000','        ldy #$0300',
     't_zero clr ,x+','        leay -1,y','        bne t_zero',
     '        clr t_y','        clr t_pending_key','        andcc #$fe',
     '        ldd #0','        jmp t_START',
     't_y equ $4300','t_pending_key equ $4301','t_saved_a equ $4302',
     't_saved_b equ $4303','t_saved_cc equ $4304','t_operand equ $4305',
     't_read_result equ $4306','t_syntabl_index equ $4c20','t_syntabl2 equ $4d03']
for name,value in constants.items():
    out.append(f't_{name} equ ${value+0x4000 if value<0x300 else value:04x}')
# Grammar pages contain some bytes also used as executable instructions in the
# original. Copy them as grammar data; translated routines live independently.
def operand(s):
    s=s.replace('a:','').replace('#(>syntabl_index)>>1','#$2e' if GRAPHICS else '#$26').replace('#>syntabl2','#$5d' if GRAPHICS else '#$4d')
    return re.sub(r'\b([A-Za-z_]\w*)\b',lambda m:'t_'+m[1] if m[1] in constants or m[1] in labels else m[1],s)
def emit(*xs):out.extend('        '+x for x in xs)
def index_base(base,index):
    target=f't_index_positive_{len(out)}'
    if index=='Y':emit('ldb t_y')
    if current_address in instructions and rom[current_address-0xe000] in zero_indexed_ops:
        original_base=base.replace('a:','')
        match=re.fullmatch(r'(\w+)(?:([+-])(\d+))?',original_base)
        offset=constants[match[1]]+(int(match[3])*(1 if match[2]=='+' else -1) if match[2] else 0)
        # Bias the wrapped byte index into the signed range around fixed U.
        # $4080 + signed((base+index)^$80) is exactly $4000+wrapped(base+index).
        emit(f'addb #${offset&255:02x}','eorb #$80')
        return 'u'
    else:
        emit('ldx #'+operand(base))
    emit('tstb','bpl '+target,'leax 256,x')
    out.append(target)
    return 'x'
def pointer(base,index):
    emit('lda '+operand(base)+'+1','ldb '+operand(base),'tfr d,x')
    # Internal null/private pointers retain their relocation. PEEK/POKE/CALL
    # operands in acc address actual CoCo memory, not the private byte page.
    if current_address not in (0xeef9,0xef0a):
        target=f't_pointer_native_{len(out)}'
        emit('cmpx #$0300','bhs '+target,'leax $4000,x');out.append(target)
        # Address preparation must not alter the source carry.
    emit('lda #0','ldb t_y' if index=='Y' else 'ldb #0')
def get_a(s):
    if s in ('KBDCR','KBD'):raise ValueError('blocking keyboard is a native service')
    if s=='DSP':emit('lda #0')
    elif s.startswith('('):
        m=re.fullmatch(r'\((\w+)(?:,([XY]))?\)(?:,([XY]))?',s)
        base,index=m[1],m[3] or 'zero'
        # X is an address scratch register, not a source-language register.
        # Restore carry after the read, then TSTA recreates LDA's NZ/V flags.
        # The address calculation and guarded read need no source input flags.
        keep_c=needs(1)
        emit('pshs cc,b' if keep_c else 'pshs b');pointer(base,index);emit('leax d,x')
        if current_address==0xeef9:
            emit('lda ,x')  # PEEK explicitly accesses the CoCo's memory bus.
        else:
            emit('jsr t_read_internal')
        if keep_c:emit('puls cc,b','tsta')
        else:emit('puls b')
    elif s.endswith((',X',',Y')):
        keep_c=needs(1)
        emit('pshs cc,b' if keep_c else 'pshs b');register=index_base(s[:-2],s[-1])
        emit('lda b,'+register)
        if keep_c:emit('puls cc,b','tsta')
        else:emit('puls b')
    else:emit('lda '+operand(s))
def store_a(s):
    if s=='DSP':emit('jsr t_console_write');return
    if s.startswith('('):
        m=re.fullmatch(r'\((\w+)\),([XY])',s)
        emit('pshs cc,d');pointer(m[1],m[2]);emit('leax d,x','lda 1,s')
        emit('sta ,x' if current_address==0xef0a else 'jsr t_write_internal')
        emit('puls cc,d')
    elif s.endswith((',X',',Y')):
        emit('pshs cc,d');register=index_base(s[:-2],s[-1]);emit('lda 1,s','sta b,'+register,'puls cc,d')
    else:
        if needs(14):emit('pshs cc')
        emit('sta '+operand(s))
        if needs(14):emit('puls cc')
def read_operand(s):
    if not s.startswith('(') and not s.endswith((',X',',Y')):
        emit('pshs cc,a');get_a(s);emit('sta t_operand','puls cc,a')
        return
    # Operand fetches do not need the nested accumulator/flag save used by LDA.
    # Preserve the source A/B/CC once; address scratch X can be overwritten.
    emit('pshs cc,d')
    if s.startswith('('):
        m=re.fullmatch(r'\((\w+)(?:,([XY]))?\)(?:,([XY]))?',s)
        pointer(m[1],m[3] or 'zero');emit('leax d,x','jsr t_read_internal')
    else:
        register=index_base(s[:-2],s[-1]);emit('lda b,'+register)
    emit('sta t_operand','puls cc,d')
def rmw(op,s):
    if not s:emit(op+'a')
    elif s.endswith((',X',',Y')):
        keep_c=op=='rol' or (op in ('inc','dec') and needs(1)) or (op=='lsr' and needs(2))
        emit('pshs cc,d' if keep_c else 'pshs d');register=index_base(s[:-2],s[-1])
        if keep_c:emit('lda ,s','tfr a,cc')
        emit(op+' b,'+register)
        if keep_c:emit('leas 1,s')
        emit('puls d')
    else:emit(op+' '+operand(s))
zero_indexed_ops={0x15,0x16,0x35,0x36,0x55,0x56,0x75,0x76,0x94,0x95,0x96,0xb4,0xb5,0xb6,0xd5,0xd6,0xf5,0xf6}
current_address=0
current=''
previous_address=None
def canonical_carry():
    global carry_mode
    if carry_mode:emit('jsr t_invert_carry')
    carry_mode=0
for address,label,op,s in lines:
    current_address=address
    if address!=previous_address and address in instructions:
        # Normalize fallthrough BEFORE an entry label. Branches/calls arriving
        # at that label already supply canonical carry and skip this conversion.
        if address in entries:
            if live_in[address]&1:canonical_carry()
            carry_mode=0
        carry_entries[address]=carry_mode
        previous_address=address
    if label:current=label
    if 0xe003<=address<0xe00c:continue
    if label and label not in ('syntabl_index','syntabl2'):out.append('t_'+label)
    if not op:continue
    if op=='.byte':
        values=s.split(',')
        for offset,value in enumerate(values):
            old=address+offset
            if 0xec00<=old<0xee00:
                out.append(f't_pc_{old:04x} equ ${old-0xec00+0x4c00:04x}')
            else:
                out.append(f't_pc_{old:04x}');emit('fcb '+byte(value))
        continue
    out.append(f't_pc_{address:04x}')
    if op=='LDA':
        # Same initial 2 KiB program/variable capacity as the reference's
        # $0800..$0FFF arena. HIMEM may expand it within native reserved bounds.
        if current=='mem_init_4k' and s in ('#$08','#$10'):s=('#$60' if s=='#$08' else '#$68') if GRAPHICS else ('#$50' if s=='#$08' else '#$58')
        get_a(s)
    elif op=='STA':store_a(s)
    elif op=='LDX':
        if s.startswith('#'):emit('ldb '+operand(s))
        else:emit('pshs a');get_a(s);emit('tfr a,b','tstb','puls a')
    elif op=='STX':
        if needs(14):emit('pshs cc')
        emit('stb '+operand(s))
        if needs(14):emit('puls cc')
    elif op=='LDY':
        if current=='input_str' and s=='#$02':s='#$52' if GRAPHICS else '#$42'
        emit('pshs a');get_a(s);emit('sta t_y','puls a')
    elif op=='STY':emit('pshs cc,a','lda t_y');store_a(s);emit('puls cc,a')
    elif op in ('INY','DEY'):emit(('inc' if op=='INY' else 'dec')+' t_y')
    elif op in ('INX','DEX'):emit('incb' if op=='INX' else 'decb')
    elif op in ('INC','DEC','ASL','LSR','ROL'):
        if op=='ROL':canonical_carry()
        rmw(op.lower(),s)
        if op in ('ASL','LSR','ROL'):carry_mode=0
    elif op=='TAY':emit('sta t_y')
    elif op=='TYA':emit('lda t_y')
    elif op=='TAX':emit('tfr a,b','tstb')
    elif op=='TXA':emit('tfr b,a','tsta')
    elif op=='PHA':emit('pshs a')
    elif op=='PLA':emit('puls a','tsta')
    elif op in ('CMP','CPX','CPY'):
        if op!='CMP':emit('pshs a','tfr b,a' if op=='CPX' else 'lda t_y')
        if s.endswith((',X',',Y')) or s.startswith('('):read_operand(s);s='t_operand'
        emit('cmpa '+operand(s))
        carry_mode=1
        if op!='CMP':emit('puls a')
    elif op in ('ADC','SBC','AND','ORA','EOR'):
        if address==0xe2ea and op=='ADC' and s=='#$02':s='#$52' if GRAPHICS else '#$42'
        ins={'ADC':'adca','SBC':'sbca','AND':'anda','ORA':'ora','EOR':'eora'}[op]
        if s.endswith((',X',',Y')) or s.startswith('('):read_operand(s);s='t_operand'
        if op=='ADC':canonical_carry()
        if op=='SBC' and not carry_mode:emit('jsr t_invert_carry')
        emit(ins+' '+operand(s))
        if op=='SBC':carry_mode=1
        elif op=='ADC':carry_mode=0
    elif op=='BIT':
        if s=='KBDCR':emit('jsr t_scan_key','pshs cc,a','lda t_pending_key','beq t_no_ready_'+str(address),'lda #$80');out.append('t_no_ready_'+str(address));emit('sta t_operand','puls cc,a')
        else:read_operand(s)
        emit('jsr t_bit_operand')
    elif op in ('BCC','BCS','BEQ','BNE','BPL','BMI','BVC','BVS'):
        # A taken edge must supply canonical carry if its destination consumes
        # it. Otherwise it can discard the dead flag, while fallthrough retains
        # the cheaper borrow convention for a following high-byte subtraction.
        target=address_expr(s)
        if live_in.get(target,15)&1:canonical_carry()
        if carry_mode and op in ('BCC','BCS'):op={'BCC':'BCS','BCS':'BCC'}[op]
        emit('l'+op.lower()+' '+operand(s))
    elif op=='JMP':
        canonical_carry()
        if s=='(acc)':
            if current=='call_stmt':emit('jsr t_call_native','rts')
            else:emit('jmp t_dispatch_verb')
        else:emit('jmp '+operand(s))
    elif op=='JSR':
        canonical_carry()
        emit('jsr '+('t_fast_get16bit' if s=='get16bit' else operand(s)))
        if current=='Le2d1' and s=='read_line':
            emit('jsr t_tape_command')
        if address in (0xef80,0xef96):
            # Memory commands address native RAM. Protect the relocated engine,
            # workspace, ROM services and machine stack from arena reassignment.
            emit('jsr t_guard_arena')
    elif op=='CLC':emit('andcc #$fe');carry_mode=0
    elif op=='SEC':emit('orcc #1');carry_mode=0
    elif op=='PHP':canonical_carry();emit('pshs cc')
    elif op=='PLP':emit('puls cc');carry_mode=0
    elif op=='TSX':emit('pshs cc,a','tfr s,x','leax 1,x','tfr x,d','puls cc,a','tstb')
    elif op=='TXS':
        emit('pshs cc,d','lda 1,s','sta t_saved_a','lda 2,s','sta t_saved_b',
             'lda ,s','sta t_saved_cc','lda #$7e','addd #1','tfr d,s',
             'ldx t_saved_a','lda t_saved_cc','tfr a,cc','tfr x,d')
    elif op=='RTS':canonical_carry();emit('rts')
    elif op=='NOP':emit('nop')
    else:raise ValueError((address,op,s))
    if not needs(1):carry_mode=0
    if address+sizes[address] not in instructions:canonical_carry()
# An overlapping DEC $4C94 entry has no writable device in the Apple console
# model; its flags are overwritten by the following LDY. Preserve that entry
# as a direct native continuation, not a write into the relocated grammar.
old_overlap=labels['l123']+1
assert rom[old_overlap-0xe000:old_overlap-0xe000+3]==bytes([0xce,0x94,0x4c])
out.append(f't_pc_{old_overlap:04x} equ t_pc_{old_overlap+3:04x}')
out += ['t_fast_get16bit',
        # Common noun-stack indices are 0..31. Keep the original routine for
        # underflow/overflow aliases, including accepted malformed getters.
        '        tstb','        bmi t_get16bit_slow','        bitb #$60',
        '        bne t_get16bit_slow','        lda #0','        sta t_y',
        '        ldx #t_noun_stk_l','        lda b,x','        sta t_acc',
        '        ldx #t_noun_stk_h_int','        lda b,x','        sta t_acc+1',
        '        ldx #t_noun_stk_h_str','        lda b,x','        bne t_get16bit_pointer',
        '        incb','        rts',
        't_get16bit_slow','        jmp t_get16bit',
        't_get16bit_pointer','        sta t_acc+1','        pshs cc,b',
        '        lda t_acc+1','        ldb t_acc','        tfr d,x',
        '        cmpx #$0300','        bhs t_get16bit_native_pointer','        leax $4000,x',
        't_get16bit_native_pointer','        jsr t_read_internal','        pshs a',
        '        leax 1,x','        jsr t_read_internal','        sta t_acc+1',
        '        puls a','        sta t_acc','        puls cc,b','        incb','        rts',
        't_read_internal','        pshs cc','        cmpx #$5000','        bhs t_internal_read_arena',
        '        cmpx #$4000','        blo t_internal_zero',
        '        cmpx #$4300','        blo t_internal_read_valid',
        '        cmpx #$4c00','        blo t_internal_zero',
        '        cmpx #$4e00','        bhs t_internal_zero',
        't_internal_read_valid','        puls cc','        lda ,x','        rts',
        't_internal_read_arena','        cmpx #$7000','        blo t_internal_read_valid',
        't_internal_zero','        puls cc','        lda #0','        rts',
        't_write_internal','        pshs cc','        cmpx #$5000','        bhs t_internal_write_arena',
        '        cmpx #$4000','        blo t_internal_ignore',
        '        cmpx #$4300','        bhs t_internal_ignore',
        't_internal_write_valid','        puls cc','        sta ,x','        rts',
        't_internal_write_arena','        cmpx #$7000','        blo t_internal_write_valid',
        't_internal_ignore','        puls cc,pc',
        # The original console bus reads zero / ignores writes to unbacked RAM.
        # Preserve that for dangling internal pointers; only PEEK/POKE use the
        # actual CoCo bus. This also prevents malformed getter expressions from
        # writing SAM/PIA registers through an underflowed variable pointer.
        't_guard_arena','        pshs cc,d','        lda t_acc+1','        ldb t_acc',
        '        cmpd #$5000','        blo t_arena_invalid',
        '        cmpd #$7000','        bhi t_arena_invalid','        puls cc,d,pc',
        't_arena_invalid','        puls cc,d','        jmp t_range_err',
        't_invert_carry','        pshs a','        tfr cc,a','        eora #1','        tfr a,cc','        puls a,pc',
        't_bit_operand','        pshs cc,d','        lda ,s','        anda #$f1','        ldb t_operand',
        '        bitb #$80','        beq t_bit_no_n','        ora #8','t_bit_no_n',
        '        bitb #$40','        beq t_bit_no_v','        ora #2','t_bit_no_v',
        '        ldb 1,s','        bitb t_operand','        bne t_bit_no_z','        ora #4',
        't_bit_no_z sta ,s','        puls cc,d,pc',
        't_scan_key','        pshs cc,d,x,y,u,dp','        lda t_pending_key','        bne t_scan_done',
        '        ldb #0','        tfr b,dp','        jsr [$a000]','t_key_poll_return','        tsta','        beq t_scan_done',
        '        ora #$80','        sta t_pending_key','t_scan_done puls cc,d,x,y,u,dp,pc',
        't_rdkey','        pshs cc,b,x,y,u,dp','        ldb #0','        tfr b,dp','        lda t_pending_key','        bne t_have_key',
        't_wait_key jsr [$a000]','t_key_read_return','        beq t_wait_key','t_have_key',
        '        anda #$7f','        cmpa #3','        bne t_key_not_break',
        '        lda #4','t_key_not_break','        cmpa #8','        bne t_key_not_backspace',
        '        lda #95','t_key_not_backspace','        cmpa #12','        bne t_key_not_clear',
        '        lda #27','t_key_not_clear','        cmpa #97','        blo t_key_upper','        cmpa #122',
        '        bhi t_key_upper','        suba #32','t_key_upper ora #$80',
        '        sta t_read_result','        clr t_pending_key','        puls cc,b,x,y,u,dp',
        '        lda t_read_result','        rts',
        't_console_write','        pshs cc,d,x,y,u,dp','        ldb #0','        tfr b,dp','        anda #$7f','        jsr [$a002]',
        't_console_out_return','        puls cc,d,x,y,u,dp,pc',
        't_call_native','        pshs cc,d,x,y,u,dp','        ldb t_acc','        lda t_acc+1',
        '        tfr d,x','        pshs d','        clrb','        tfr b,dp','        puls d',
        '        jsr ,x','        puls cc,d,x,y,u,dp,pc',
        't_dispatch_verb','        pshs cc,d,x','        ldb t_y','        lda #0',
        '        ldx #t_native_verbs','        lslb','        rola','        leax d,x',
        '        ldy ,x','        puls cc,d,x','        jmp ,y','t_native_verbs']
# Original table is little-endian split arrays. Native dispatch words are BE.
for low,high in zip(rom[0xa10:0xa88],rom[0xa88:0xb00]):
    address=low+256*high
    emit(f'fdb ${address:04x}' if address in (0,0xffff) else f'fdb t_pc_{address:04x}')
out += ['t_code_end','        include "../native/tape.asm"','        org $4c00']
for i in range(0xc00,0xe00,16):emit('fcb '+','.join(f'${b:02x}' for b in rom[i:i+16]))
out += ['        end t_boot','']
def graphics_relocate(text):
    # Named build profile: private page/grammar +$1000, arena starts $6000.
    # Stack/staging and the $7000 arena ceiling remain fixed on a 32K CoCo.
    return re.sub(r'\$([4-6][0-9a-fA-F]{3})\b',lambda m:f'${int(m[1],16)+0x1000:04x}',text)
if GRAPHICS:
    assembly=graphics_relocate('\n'.join(out))
    assembly=assembly.replace('org $0800','org $2000',1)
    assembly=assembly.replace('lda #$40\n        tfr a,dp','lda #$50\n        tfr a,dp')
    assembly=assembly.replace('setdp $40','setdp $50')
    assembly=assembly.replace('        ldd #0\n        jmp t_START','        jsr gt_init\n        ldd #0\n        jmp t_START',1)
    assembly=assembly.replace('jsr [$a002]','jsr gt_write')
    assembly=assembly.replace('t_code_end\n        include "../native/tape.asm"',
        't_native_engine_end\n        include "../native/graphics-terminal.asm"\nt_code_end\n        include "graphics-tape.inc"')
    assembly=assembly.replace('t_key_read_return\n        beq t_wait_key',
        't_key_read_return\n        bne t_have_key\n        jsr gt_tick\n        bra t_wait_key')
    (ROOT/'build/graphics-runtime.asm').write_text(assembly)
    tape=graphics_relocate((ROOT/'native/tape.asm').read_text())
    tape=tape.replace('lda #$40','lda #$50')
    (ROOT/'build/graphics-tape.inc').write_text(tape)
    font=json.loads((ROOT/'native/terminal-font.json').read_text())
    (ROOT/'build/graphics-font.inc').write_text('gt_font\n'+'\n'.join('        fcb '+','.join(f'${v:02x}' for v in row) for row in font)+'\n')
else:
    (ROOT/'build/runtime-prototype.asm').write_text('\n'.join(out))
(ROOT/('build/graphics-optimization.json' if GRAPHICS else 'build/runtime-optimization.json')).write_text(json.dumps({
    'live_in':live_in,'live_out':live_out,'carry_entries':carry_entries,
    'scope':'Conservative flag liveness; calls and unknown control-flow retain flags'
},indent=2)+'\n')
