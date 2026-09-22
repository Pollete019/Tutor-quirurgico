const fs=require('fs');
const html=fs.readFileSync(process.argv[2],'utf8');
const s=html.lastIndexOf('<script>'), e=html.lastIndexOf('</script>');
let code=html.slice(s+8,e).replace(/renderHist\(\);\s*$/,'');
const stub=`const document={getElementById:()=>({}),querySelectorAll:()=>[],addEventListener:()=>{}};const localStorage={getItem:()=>null,setItem:()=>{}};const window={};`;
code=stub+code+`;module.exports={TEMAS_TEST,PREGUNTAS,ESPECIALIDADES,CASOS,VICARIOS,VIC_PREGUNTAS,GRUPOS_FICHAS,FICHAS,COMPARATIVAS,ERRORES,TEMAS,P,VISUAL_ITEMS};`;
fs.writeFileSync(process.argv[3]+'/data.js',code);
const d=require(process.argv[3]+'/data.js');
fs.writeFileSync(process.argv[3]+'/data.json',JSON.stringify(d,null,1));
const cnt=o=>Object.fromEntries(Object.entries(o).map(([k,v])=>[k,v.length]));
console.log('PREGUNTAS',cnt(d.PREGUNTAS));console.log('P',cnt(d.P));
console.log('CASOS',cnt(d.CASOS));console.log('FICHAS',cnt(d.FICHAS));
console.log('VICARIOS',d.VICARIOS.length,'VIC_PREG',d.VIC_PREGUNTAS.length,'COMP',d.COMPARATIVAS.length,'ERR',d.ERRORES.length,'VIS',d.VISUAL_ITEMS.length);
for(const k of ['PREGUNTAS','CASOS','FICHAS']){const o=d[k];const f=Object.values(o)[0][0];console.log(k,JSON.stringify(f).slice(0,500));}
console.log('P',JSON.stringify(Object.values(d.P)[0][0]).slice(0,300));
console.log('VICP',JSON.stringify(d.VIC_PREGUNTAS[0]).slice(0,300));
console.log('COMP',JSON.stringify(d.COMPARATIVAS[0]).slice(0,500));
console.log('ERR',JSON.stringify(d.ERRORES[0]).slice(0,400));
const v=d.VISUAL_ITEMS[0];console.log('VIS',Object.keys(v),JSON.stringify({...v,img:(v.img||'').slice(0,40)}).slice(0,500));
