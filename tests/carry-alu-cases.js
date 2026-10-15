// Arithmetic expectations use signed integer ranges and nibble sums, independent
// of the emulator's XOR flag formulas. Motorola M6809PM, Appendix A, ADC/SBC:
// https://www.maddes.net/m6809pm/appendix_a.htm
export function registerCarryALUTests({suite,test,eq,makeCPU}) {
    suite('ADC/SBC exhaustive arithmetic and flags');
    for (const [name,opcode,register,subtract] of [
        ['ADCA',0x89,'a',false],['ADCB',0xc9,'b',false],
        ['SBCA',0x82,'a',true],['SBCB',0xc2,'b',true]]) {
        test(`${name}: every byte pair and incoming carry/borrow`,()=>{
            const cpu=makeCPU([opcode,0]);
            for(let left=0;left<256;left++) for(let right=0;right<256;right++) {
                cpu.mem[1]=right;
                for(let carry=0;carry<2;carry++) {
                    cpu.pc=0; cpu[register]=left; cpu.flagC=Boolean(carry);
                    cpu.step();
                    const unsigned=subtract ? left-right-carry : left+right+carry;
                    const a=left<128 ? left : left-256;
                    const b=right<128 ? right : right-256;
                    const signed=subtract ? a-b-carry : a+b+carry;
                    const value=unsigned&255;
                    const label=`${name} ${left},${right},C=${carry}`;
                    eq(cpu[register],value,label+' result');
                    eq(cpu.flagN,value>=128,label+' N');
                    eq(cpu.flagZ,value===0,label+' Z');
                    eq(cpu.flagV,signed < -128 || signed > 127,label+' V');
                    eq(cpu.flagC,subtract ? unsigned<0 : unsigned>255,label+' C');
                    if(!subtract) eq(cpu.flagH,(left&15)+(right&15)+carry>15,label+' H');
                }
            }
        });
    }
}
