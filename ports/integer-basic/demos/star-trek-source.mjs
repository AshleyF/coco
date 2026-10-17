// Preserve the retrieved source; adapt only platform memory addresses.
import {readFileSync} from 'node:fs';
export const originalSource=readFileSync(new URL('./star-trek.original.bas',import.meta.url),'utf8');
export function compact(source){
 return source.split(/\r?\n/).filter(s=>s.trim()).map(line=>{
  if(!/^\d+ /.test(line))return line;
  const [,number,body]=/^(\d+) (.*)$/.exec(line);let quoted=false,text='';
  for(const ch of body){if(ch==='"')quoted=!quoted;if(ch!==' '||quoted)text+=ch;}
  return number+' '+text;
 }).join('\n')+'\n';
}
export const appleSource=compact(originalSource);
// $5000..$5CFF has the same 3328-byte capacity as Apple's $0300..$0FFF.
// Two explicit PEEK/POKE maps use free CoCo RAM $0600..$067F.
export const cocoSource=compact(originalSource.replace('LOMEM = 768','HIMEM=23808')
 .replace('Q=640:S=704:','Q=1536:S=1600:'));
