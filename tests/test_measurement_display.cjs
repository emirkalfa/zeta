const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
class Node {
  constructor(tag,text=''){this.tagName=tag;this.children=[];this.value=text;this.className='';}
  set textContent(text){this.value=String(text);this.children=[];}
  get textContent(){return this.value+this.children.map(n=>n.textContent).join('');}
  append(...nodes){this.children.push(...nodes);}
  replaceChildren(...nodes){this.value='';this.children=nodes;}
}
function context(){
  const nodes={};const document={getElementById(id){return nodes[id]??=new Node('div');},createElement(tag){return new Node(tag);},createTextNode(text){return new Node('#text',text);}};
  const c=vm.createContext({document,window:{addEventListener(){}}});
  for(const file of ['fuselage.js','app.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../static/js/'+file),'utf8'),c);
  c.geom={wing_area:.3225,aspect_ratio:6.977,mac:.215,weight:4,fuselage_length:1.2,fuse_type:'manual',fuse_sections:[{t:0,w:.1,h:.1},{t:1.2,w:.15,h:.15}]};
  return {c,nodes};
}
test('measurement cards render plain readable numbers and units without encoded text',()=>{
  const {c,nodes}=context();vm.runInContext('displayResults(geom)',c);
  const cards=nodes['results-summary'].children;
  assert.deepEqual(cards.map(n=>n.children[1].textContent),['0.3225 m²','6.977','0.215 m','12.40 kg/m²']);
  assert.equal(cards[1].children[1].children[0].children.length,1);
  for(const card of cards)assert.doesNotMatch(card.textContent,/&#|undefined|NaN/);
});
test('measurement values retain text safely and missing/non-finite numbers use a dash',()=>{
  const {c}=context();
  c.value='<img src=x onerror=alert(1)>';
  const node=vm.runInContext("measurementValue(value,'m²')",c);
  assert.equal(node.textContent,'<img src=x onerror=alert(1)> m²');
  assert.deepEqual(node.children.map(n=>n.tagName),['span','#text','span']);
  for(const v of [undefined,null,NaN,Infinity,-Infinity]){c.v=v;assert.equal(vm.runInContext('measurementValue(v).textContent',c),'—');}
});
test('result numbers and units have a non-wrapping responsive layout',()=>{
  const css=fs.readFileSync(path.join(__dirname,'../static/css/style.css'),'utf8');
  assert.match(css,/\.measurement-value\s*\{[^}]*white-space:\s*nowrap/);
  assert.match(css,/minmax\(min\(100%, 190px\), 1fr\)/);
});
