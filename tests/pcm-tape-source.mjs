// Test-only analog input source. Read the saved PCM samples directly, without
// the application's WAV-to-CAS decoder or CAS pulse generator in the path.
export function attachPCM(machine,buffer) {
    const bytes=buffer instanceof ArrayBuffer?new Uint8Array(buffer):buffer;
    const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
    const text=(at,n)=>String.fromCharCode(...bytes.subarray(at,at+n));
    if(text(0,4)!=='RIFF'||text(8,4)!=='WAVE'||text(36,4)!=='data'
        ||view.getUint16(20,true)!==1||view.getUint16(22,true)!==1||view.getUint16(34,true)!==16)
        throw Error('Test source requires canonical mono 16-bit PCM WAV');
    const rate=view.getUint32(24,true),count=view.getUint32(40,true)/2;
    let cycles=0;
    const tape=machine.cassette;
    tape.motorOn=false;
    tape.interceptEnabled=false;
    tape.playBuffer=null;
    tape.advanceCycles=n=>{if(tape.motorOn)cycles+=n;};
    tape.readBit=()=>{
        const sample=Math.floor(cycles*rate/894886);
        return sample<count&&view.getInt16(44+sample*2,true)>0?1:0;
    };
}
