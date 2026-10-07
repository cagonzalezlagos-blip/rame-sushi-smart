const ESC=0x1b,GS=0x1d;
function textBytes(text){return Buffer.from(String(text).replace(/[\x00-\x1f\x7f]/g,' ').replaceAll('─','-').replaceAll('→','>').replaceAll('·','-').replaceAll('€','EUR').replace(/[^\x20-\xff]/g,'?'),'latin1');}
function wrap(text,columns){const lines=[];for(const paragraph of String(text).split(/\r?\n/)){let line='';for(const word of paragraph.split(/\s+/)){if(!word)continue;if(line&&(line+' '+word).length>columns){lines.push(line);line='';}let part=word;while(part.length>columns){if(line){lines.push(line);line='';}lines.push(part.slice(0,columns));part=part.slice(columns);}line=line?line+' '+part:part;}lines.push(line);}return lines;}
export function receiptBytes(lines){
 // RAW ESC/POS receipts contain no drawer pulse. Text cannot inject control bytes.
 const parts=[Buffer.from([ESC,0x40,ESC,0x74,16,ESC,0x4d,0])];
 for(const line of lines){const mode=line.size>=16?0x11:line.size>=12?0x01:0;parts.push(Buffer.from([GS,0x21,mode,ESC,0x45,line.bold?1:0]));for(const text of wrap(line.text,mode===0x11?21:42))parts.push(textBytes(text),Buffer.from([10]));}
 parts.push(Buffer.from([GS,0x21,0,ESC,0x45,0,10,10,10,10,GS,0x56,0x42,0]));return Buffer.concat(parts);
}
export function drawerBytes(pin=0){if(![0,1].includes(pin))throw Error('Pin de cajón inválido');return Buffer.from([ESC,0x70,pin,25,250]);}
