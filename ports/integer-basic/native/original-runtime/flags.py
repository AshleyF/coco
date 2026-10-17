"""Conservative flag liveness for the static translation, never ROM mutation.

Calls retain both callee-entry and continuation requirements. RTS and unknown
edges demand every flag, so no return-value assumptions or call summaries are
needed. This deliberately sacrifices optimization at uncertain boundaries.
"""
import re
C,V,Z,N=1,2,4,8
ALL=C|V|Z|N

def analyze(lines,labels,sizes):
    nodes={a:(op,s) for a,_,op,s in lines if op and op!='.byte'}
    successors={};uses={};defines={};unknown=set()
    def target(s):
        m=re.fullmatch(r'(\w+)(?:([+-])(\d+))?',s)
        if not m or m[1] not in labels:return None
        return labels[m[1]]+(int(m[3])*(1 if m[2]=='+' else -1) if m[3] else 0)
    for a,(op,s) in nodes.items():
        use=definition=0;next_=a+sizes[a];edges=[next_]
        if op in ('LDA','LDX','LDY','AND','ORA','EOR','INC','DEC','INX','DEX','INY','DEY','TAX','TXA','TAY','TYA','TSX','PLA'):definition=N|Z|V
        elif op in ('CMP','CPX','CPY','ASL'):definition=ALL
        elif op=='LSR':definition=C|N|Z  # 6809 LSR preserves V.
        elif op in ('ADC','SBC','ROL'):use=C;definition=ALL
        elif op=='BIT':definition=N|Z|V
        elif op in ('CLC','SEC'):definition=C
        elif op=='PHP':use=ALL
        elif op=='PLP':definition=ALL
        elif op in ('BCC','BCS','BEQ','BNE','BPL','BMI','BVC','BVS'):
            use={'BCC':C,'BCS':C,'BEQ':Z,'BNE':Z,'BPL':N,'BMI':N,'BVC':V,'BVS':V}[op]
            edges.append(target(s))
        elif op=='JMP':edges=[target(s)]
        elif op=='JSR':edges.append(target(s))
        elif op=='RTS':use=ALL;edges=[]
        elif op not in ('STA','STX','STY','PHA','TXS','NOP'):
            raise ValueError(('unclassified flag behavior',a,op,s))
        if any(e not in nodes for e in edges):unknown.add(a)
        successors[a]=[e for e in edges if e in nodes]
        uses[a]=use;defines[a]=definition
    live_in={a:ALL for a in nodes};live_out={a:ALL for a in nodes}
    changed=True
    while changed:
        changed=False
        for a in reversed(nodes):
            out=ALL if a in unknown else 0
            for e in successors[a]:out|=live_in[e]
            incoming=uses[a]|(out&~defines[a])
            if out!=live_out[a] or incoming!=live_in[a]:changed=True
            live_out[a]=out;live_in[a]=incoming
    return live_in,live_out
