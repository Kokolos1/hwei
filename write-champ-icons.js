const fs=require('fs');
const path=require('path');
const dir=path.join(process.cwd(),'images','champions');
const candidate='Aatrox.png';
let src=path.join(dir,candidate);
if(!fs.existsSync(src)){
  const alt='Ashe.png';
  if(!fs.existsSync(path.join(dir,alt))) throw 'No source icon available';
  src=path.join(dir,alt);
}
const data=fs.readFileSync(src);
['Hwei','Smolder','Yunara'].forEach(n=>{const p=path.join(dir,`${n}.png`); fs.writeFileSync(p,data); console.log('Wrote', p);});
