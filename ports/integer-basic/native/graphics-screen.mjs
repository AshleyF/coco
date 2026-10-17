// Test-only bitmap decoder. It never supplies pixels or text to the target.
import {readFileSync} from 'node:fs';
const font=JSON.parse(readFileSync(new URL('./terminal-font.json',import.meta.url),'utf8'));
const key=bytes=>bytes.join(',');
const glyphs=new Map(font.map((rows,i)=>[key(rows.map(v=>v&0xfc)),String.fromCharCode(i<32?i+64:i)]));
export function readGraphicsScreen(machine){
 const ram=machine.mem?.ram??machine,lines=[];
 for(let row=0;row<24;row++){
  let line='';for(let col=0;col<40;col++){
   const bits=[];for(let dy=0;dy<8;dy++){
    let value=0;for(let dx=0;dx<6;dx++){const px=8+col*6+dx;if(ram[0x800+(row*8+dy)*32+(px>>3)]&(0x80>>(px&7)))value|=0x80>>dx;}bits.push(value);
   }
   line+=glyphs.get(key(bits))??(bits.every(v=>v===252)?' ':'?');
  }lines.push(line);
 }return lines.join('\n');
}
