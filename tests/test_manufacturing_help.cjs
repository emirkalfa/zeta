const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const context=vm.createContext({});
vm.runInContext(fs.readFileSync(require('node:path').join(__dirname,'../static/js/manufacturing-help.js'),'utf8'),context);
for(const [message,field] of [
  ['wing_right: kanat dilim bağlantısı oluşturulamadı; yazıcı ölçülerini kontrol edin.','airfoil'],
  ['Yazıcı hacmi bu parçayı bölmek için çok küçük.','printBedX'],
  ['İki pervane birbiriyle çakışıyor.','propDiameter'],
  ['cameraHoleX: 3–7 aralığında bir değer girin.','cameraDepth'],
  ['Ø6 mm boru için sabit kanat payı yetersiz.','sparMainDia'],
  ['Motor orta deliği vida deliklerine çok yakın.','motorDiameter'],
  ['wingPin: 2–5 aralığında bir değer girin.','wingSeatDepth'],
  ['Bilinmeyen STL hatası','calculateBtn']
])test('export advice: '+message,()=>{
  context.message=message;const advice=vm.runInContext('manufacturingAdvice(message)',context);
  assert.equal(advice.steps[0][0],field);assert.ok(advice.reason.length>15);
});
test('printer advice never asks user to invent larger bed dimensions',()=>{
  const advice=vm.runInContext('manufacturingAdvice("yazıcı hacmine sığmıyor")',context);
  assert.match(advice.steps[0][1],/gerçek/);assert.match(advice.steps[0][1],/daha büyük değer yazma/);
});
