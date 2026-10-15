"""Experimental static MC6809 translation of the complete original BASIC engine.

No source-CPU interpreter/decoder is emitted. Original algorithms execute as
native assembly; console services and pointer layouts adapt to the CoCo.
Wozniak BASIC; disassembly copyright 2003 Eric Smith, ca65 by Jeff Tranter.
"""
from pathlib import Path
import re,hashlib
ROOT=Path(__file__).resolve().parents[2]
rom=(ROOT/'reference/a1basic.bin').read_bytes()
assert hashlib.sha256(rom).hexdigest()=='5d8a3fe3c20c42903b226d67430c840ea5119557f88774c069e2e4dd80ad2c67'
source=(ROOT/'reference/a1basic.s').read_text()
constants={name:int(value,16) for name,value in re.findall(r'^(\w+)\s*=\s*\$([0-9A-Fa-f]+)',source,re.M)}
lines=[]; labels={}; instructions=set(); data=set()
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
    else:instructions.add(address)
    lines.append((address,label,op,arg))
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
     '        org $0800','t_boot orcc #$50','        lds #$7f00',
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
    s=s.replace('a:','').replace('#(>syntabl_index)>>1','#$26').replace('#>syntabl2','#$4d')
    return re.sub(r'\b([A-Za-z_]\w*)\b',lambda m:'t_'+m[1] if m[1] in constants or m[1] in labels else m[1],s)
def emit(*xs):out.extend('        '+x for x in xs)
def index_base(base,index):
    target=f't_index_positive_{len(out)}'
    if index=='Y':emit('ldb t_y')
    if current_address in instructions and rom[current_address-0xe000] in zero_indexed_ops:
        original_base=base.replace('a:','')
        match=re.fullmatch(r'(\w+)(?:([+-])(\d+))?',original_base)
        offset=constants[match[1]]+(int(match[3])*(1 if match[2]=='+' else -1) if match[2] else 0)
        emit(f'addb #${offset&255:02x}','ldx #$4000')
    else:
        emit('ldx #'+operand(base))
    emit('tstb','bpl '+target,'leax 256,x')
    out.append(target)
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
        emit('pshs cc,b,x');pointer(base,index)
        # Restore carry before loading, while keeping computed address/index.
        emit('lda ,s','tfr a,cc','lda #0')
        if current_address==0xeef9:
            emit('lda d,x')  # PEEK explicitly accesses the CoCo's memory bus.
        else:
            emit('leax d,x','jsr t_read_internal')
        emit('leas 1,s','puls b,x')
    elif s.endswith((',X',',Y')):
        emit('pshs cc,b,x');index_base(s[:-2],s[-1]);emit('lda ,s','tfr a,cc','lda b,x','leas 1,s','puls b,x')
    else:emit('lda '+operand(s))
def store_a(s):
    if s=='DSP':emit('jsr t_console_write');return
    if s.startswith('('):
        m=re.fullmatch(r'\((\w+)\),([XY])',s)
        emit('pshs cc,d,x');pointer(m[1],m[2]);emit('leax d,x','lda 1,s')
        emit('sta ,x' if current_address==0xef0a else 'jsr t_write_internal')
        emit('puls cc,d,x')
    elif s.endswith((',X',',Y')):
        emit('pshs cc,d,x');index_base(s[:-2],s[-1]);emit('lda 1,s','sta b,x','puls cc,d,x')
    else:emit('pshs cc','sta '+operand(s),'puls cc')
def read_operand(s):
    emit('pshs cc,a');get_a(s);emit('sta t_operand','puls cc,a')
def rmw(op,s):
    if not s:emit(op+'a')
    elif s.endswith((',X',',Y')):
        emit('pshs cc,d,x');index_base(s[:-2],s[-1]);emit('lda ,s','tfr a,cc',op+' b,x','leas 1,s','puls d,x')
    else:emit(op+' '+operand(s))
zero_indexed_ops={0x15,0x16,0x35,0x36,0x55,0x56,0x75,0x76,0x94,0x95,0x96,0xb4,0xb5,0xb6,0xd5,0xd6,0xf5,0xf6}
current_address=0
current=''
for address,label,op,s in lines:
    current_address=address
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
        if current=='mem_init_4k' and s in ('#$08','#$10'):s='#$50' if s=='#$08' else '#$58'
        get_a(s)
    elif op=='STA':store_a(s)
    elif op=='LDX':
        if s.startswith('#'):emit('ldb '+operand(s))
        else:emit('pshs a');get_a(s);emit('tfr a,b','tstb','puls a')
    elif op=='STX':emit('pshs cc','stb '+operand(s),'puls cc')
    elif op=='LDY':
        if current=='input_str' and s=='#$02':s='#$42'
        emit('pshs a');get_a(s);emit('sta t_y','puls a')
    elif op=='STY':emit('pshs cc,a','lda t_y');store_a(s);emit('puls cc,a')
    elif op in ('INY','DEY'):emit(('inc' if op=='INY' else 'dec')+' t_y')
    elif op in ('INX','DEX'):emit('incb' if op=='INX' else 'decb')
    elif op in ('INC','DEC','ASL','LSR','ROL'):rmw(op.lower(),s)
    elif op=='TAY':emit('sta t_y')
    elif op=='TYA':emit('lda t_y')
    elif op=='TAX':emit('tfr a,b','tstb')
    elif op=='TXA':emit('tfr b,a','tsta')
    elif op=='PHA':emit('pshs a')
    elif op=='PLA':emit('puls a','tsta')
    elif op in ('CMP','CPX','CPY'):
        if op!='CMP':emit('pshs a','tfr b,a' if op=='CPX' else 'lda t_y')
        if s.endswith((',X',',Y')) or s.startswith('('):read_operand(s);s='t_operand'
        emit('cmpa '+operand(s),'jsr t_invert_carry')
        if op!='CMP':emit('puls a')
    elif op in ('ADC','SBC','AND','ORA','EOR'):
        if address==0xe2ea and op=='ADC' and s=='#$02':s='#$42'
        ins={'ADC':'adca','SBC':'sbca','AND':'anda','ORA':'ora','EOR':'eora'}[op]
        if s.endswith((',X',',Y')) or s.startswith('('):read_operand(s);s='t_operand'
        if op=='SBC':emit('jsr t_invert_carry')
        emit(ins+' '+operand(s))
        if op=='SBC':emit('jsr t_invert_carry')
    elif op=='BIT':
        if s=='KBDCR':emit('jsr t_scan_key','pshs cc,a','lda t_pending_key','beq t_no_ready_'+str(address),'lda #$80');out.append('t_no_ready_'+str(address));emit('sta t_operand','puls cc,a')
        else:read_operand(s)
        emit('jsr t_bit_operand')
    elif op in ('BCC','BCS','BEQ','BNE','BPL','BMI','BVC','BVS'):emit('l'+op.lower()+' '+operand(s))
    elif op=='JMP':
        if s=='(acc)':
            if current=='call_stmt':emit('jsr t_call_native','rts')
            else:emit('jmp t_dispatch_verb')
        else:emit('jmp '+operand(s))
    elif op=='JSR':
        emit('jsr '+operand(s))
        if address in (0xef80,0xef96):
            # Memory commands address native RAM. Protect the relocated engine,
            # workspace, ROM services and machine stack from arena reassignment.
            emit('jsr t_guard_arena')
    elif op=='CLC':emit('andcc #$fe')
    elif op=='SEC':emit('orcc #1')
    elif op=='PHP':emit('pshs cc')
    elif op=='PLP':emit('puls cc')
    elif op=='TSX':emit('pshs cc,a','tfr s,x','leax 1,x','tfr x,d','puls cc,a','tstb')
    elif op=='TXS':
        emit('pshs cc,d','lda 1,s','sta t_saved_a','lda 2,s','sta t_saved_b',
             'lda ,s','sta t_saved_cc','lda #$7e','addd #1','tfr d,s',
             'ldx t_saved_a','lda t_saved_cc','tfr a,cc','tfr x,d')
    elif op=='RTS':emit('rts')
    elif op=='NOP':emit('nop')
    else:raise ValueError((address,op,s))
# An overlapping DEC $4C94 entry has no writable device in the Apple console
# model; its flags are overwritten by the following LDY. Preserve that entry
# as a direct native continuation, not a write into the relocated grammar.
old_overlap=labels['l123']+1
assert rom[old_overlap-0xe000:old_overlap-0xe000+3]==bytes([0xce,0x94,0x4c])
out.append(f't_pc_{old_overlap:04x} equ t_pc_{old_overlap+3:04x}')
out += ['t_read_internal','        pshs cc','        bsr t_internal_address',
        '        bcs t_internal_zero','        puls cc','        lda ,x','        rts',
        't_internal_zero','        puls cc','        lda #0','        rts',
        't_write_internal','        pshs cc','        cmpx #$4c00','        blo t_internal_write_check',
        '        cmpx #$4e00','        blo t_internal_ignore',
        't_internal_write_check','        bsr t_internal_address',
        '        bcs t_internal_ignore','        puls cc','        sta ,x','        rts',
        't_internal_ignore','        puls cc,pc',
        # The original console bus reads zero / ignores writes to unbacked RAM.
        # Preserve that for dangling internal pointers; only PEEK/POKE use the
        # actual CoCo bus. This also prevents malformed getter expressions from
        # writing SAM/PIA registers through an underflowed variable pointer.
        't_internal_address','        cmpx #$4000','        blo t_internal_invalid',
        '        cmpx #$4300','        blo t_internal_valid',
        '        cmpx #$4c00','        blo t_internal_invalid',
        '        cmpx #$4e00','        blo t_internal_valid',
        '        cmpx #$5000','        blo t_internal_invalid',
        '        cmpx #$7000','        bhs t_internal_invalid',
        't_internal_valid','        andcc #$fe','        rts',
        't_internal_invalid','        orcc #1','        rts',
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
        '        jsr [$a000]','t_key_poll_return','        tsta','        beq t_scan_done',
        '        ora #$80','        sta t_pending_key','t_scan_done puls cc,d,x,y,u,dp,pc',
        't_rdkey','        pshs cc,b,x,y,u,dp','        lda t_pending_key','        bne t_have_key',
        't_wait_key jsr [$a000]','t_key_read_return','        beq t_wait_key','t_have_key',
        '        anda #$7f','        cmpa #8','        bne t_key_not_backspace',
        '        lda #95','t_key_not_backspace','        cmpa #12','        bne t_key_not_clear',
        '        lda #27','t_key_not_clear','        cmpa #97','        blo t_key_upper','        cmpa #122',
        '        bhi t_key_upper','        suba #32','t_key_upper ora #$80',
        '        sta t_read_result','        clr t_pending_key','        puls cc,b,x,y,u,dp',
        '        lda t_read_result','        rts',
        't_console_write','        pshs cc,d,x,y,u,dp','        anda #$7f','        jsr [$a002]',
        't_console_out_return','        puls cc,d,x,y,u,dp,pc',
        't_call_native','        pshs cc,d,x,y,u,dp','        ldb t_acc','        lda t_acc+1',
        '        tfr d,x','        jsr ,x','        puls cc,d,x,y,u,dp,pc',
        't_dispatch_verb','        pshs cc,d,x','        ldb t_y','        lda #0',
        '        ldx #t_native_verbs','        lslb','        rola','        leax d,x',
        '        ldu ,x','        puls cc,d,x','        jmp ,u','t_native_verbs']
# Original table is little-endian split arrays. Native dispatch words are BE.
for low,high in zip(rom[0xa10:0xa88],rom[0xa88:0xb00]):
    address=low+256*high
    emit(f'fdb ${address:04x}' if address in (0,0xffff) else f'fdb t_pc_{address:04x}')
out += ['t_code_end','        org $4c00']
for i in range(0xc00,0xe00,16):emit('fcb '+','.join(f'${b:02x}' for b in rom[i:i+16]))
out += ['        end t_boot','']
(ROOT/'build/runtime-prototype.asm').write_text('\n'.join(out))
