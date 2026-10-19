/* Explain failed exports without bypassing the production checks. */
function manufacturingAdvice(message) {
  const rules=[
    [/karbon boru.*kök pimi|karbon boru.*çok yakın/i,'Karbon boru hattı kök kilit pimine veya diğer boruya fazla yakın.',[
      ['sparMainPosition','Ana boru konumunu değiştir. Kanal ile kök pimi birbirini kesmemeli.'],
      ['sparRearPosition','Arka boru konumunu değiştir. Gerçek boru çaplarıyla yeterli et kalınlığı bırak.']]],
    [/kanat dilim bağlantısı/i,'Kanat dilimlerinin vidalı iç geçmeleri için yeterli engelsiz alan bulunamadı.',[
      ['airfoil','Daha kalın bir kanat profili seç veya kanat veterini artır. İnce kenara vida eklenmez.'],
      ['mountScrew','Vida çapını ve somun ölçülerini gerçek donanımınla karşılaştır. Uygun daha küçük bağlantı donanımı seçebilirsin.'],
      ['printBedX','Yazıcının gerçek baskı hacmini kontrol et; doğru olmayan büyük ölçü girme. Üretim önizlemesini tekrar çalıştır.'],
      ['wingJoinMode','Vidalı birleşimden vazgeçeceksen Yapıştırmalı (önceki yöntem) seçeneğiyle eski parçalama yöntemini kullanabilirsin. Bu modda dilim vidaları ve iç geçmeleri oluşmaz.']]],
    [/yazıcı|bölme sınırı|bed[XYZ]/i,'Parça, yazıcının kullanılabilir baskı alanına sığmıyor.',[
      ['printBedX','Yazıcının gerçek kullanılabilir X, Y ve Z ölçülerini kontrol et. Sadece hatayı kaldırmak için daha büyük değer yazma.'],
      ['wingspan','Ölçüler doğruysa kanat açıklığını/model boyutunu azaltıp Hesapla’ya bas. Otomatik bölme bundan sonra yeniden denenir.']]],
    [/pervane/i,'Pervanenin döneceği alan başka bir parçaya değiyor.',[
      ['propDiameter','Kullanacağın pervanenin gerçek çapını kontrol et; daha küçük pervane kullanacaksan çapı azalt.'],
      ['motorStation','Çift motorda motorları kanat ucuna doğru taşı: kanattaki konum yüzdesini artır. Tek motorda pervane düzlemi mesafesini kontrol et.'],
      ['propOffset','Motor önünden pervane düzlemine mesafeyi gerçek motor/şaft ölçüsüyle karşılaştır.']]],
    [/camera|kamera/i,'Kamera veya yan vida konumu mevcut burun yuvasına uymuyor.',[
      ['cameraDepth','Kamera kasasını ölç: genişlik, yükseklik ve derinlik alanlarını gerçek değerlerle doldur.'],
      ['cameraHoleX','Ön yüzden vida merkezine mesafe, kasa derinliğinin içinde ve kenardan en az 3 mm uzakta olmalı.'],
      ['cameraHoleY','Üst yüzden vida merkezine mesafe, kasa yüksekliğinin içinde ve kenardan en az 3 mm uzakta olmalı. Kamera sığmıyorsa daha küçük kamera veya daha büyük gövde seç.']]],
    [/boru|spar/i,'Karbon boru deliği kanadın ince kısmına veya hareketli yüzeye taşıyor.',[
      ['sparMainDia','Ana ve arka boru çaplarını gerçek borularınla karşılaştır. Daha ince boru seçebilir veya kullanmadığın kanalın çapını 0 yapabilirsin.'],
      ['sparRearDia','Arka boru için de aynı kontrolü yap. Gerekirse daha büyük kanat/kök veteri seçip Hesapla’ya bas.']]],
    [/motor|pervane|motorSpacing|motorBore/i,'Motor taşıyıcısındaki ölçüler veya delikler birbiriyle uyuşmuyor.',[
      ['motorDiameter','Motorun gerçek dış çapını ve vida düzenini kontrol et.'],
      ['motorSpacingY','Karşılıklı vida merkezleri arasındaki mesafeleri gir; orta mil deliğiyle vida deliklerinin üst üste gelmemesi gerekir.'],
      ['motorBore','Mil ve kablo deliği ölçülerini kontrol et. Hata devam ederse bu motor için daha geniş taşıyıcı/model gerekir.']]],
    [/wingPin|wingSeat|kök yuvası/i,'Kanat kökündeki oturma veya pim ölçüsü uygun değil.',[
      ['wingSeatDepth','Oturma derinliğini 4–12 mm aralığında azalt.'],
      ['wingPin','Pim çapını gerçek pimine göre 2–5 mm aralığında gir; gerekirse kanat boyutunu artırıp yeniden hesapla.']]],
    [/gövde çok küçük|kesit|gövde boyu/i,'Gövde boyutu veya kesitleri üretime uygun değil.',[
      ['fuseWidthScale','Gövde genişliğini artır veya hazır gövde modellerinden birini seç.'],
      ['wingspan','Modeli büyütüp Hesapla’ya bas. Kapak için gereken en küçük ölçüler hata ayrıntısında gösterilir.']]],
    [/fetch|network|bağlantı|JSON|Unexpected token/i,'Uygulamadan geçerli bir üretim yanıtı alınamadı.',[
      ['calculateBtn','ZETA’nın çalıştığını kontrol et, sayfayı yenile ve Hesapla’ya bas. Ardından ZIP’i yeniden dene.']]]
  ];
  const found=rules.find(([pattern])=>pattern.test(message));
  return found?{reason:found[1],steps:found[2]}:{reason:'Bu ölçülerle baskıya uygun parça oluşturulamadı.',steps:[
    ['calculateBtn','Son değiştirdiğin ölçüyü önceki değerine döndürüp Hesapla’ya bas.'],
    ['manufacturingPreview','Üretim önizlemesini yeniden çalıştır. Aynı hata sürerse aşağıdaki hata ayrıntısını ve kullandığın ölçüleri paylaş; sorun model üretiminde olabilir.']]};
}

function showManufacturingIssue(message) {
  const host=document.getElementById('manufacturingIssue');if(!host)return;
  host.replaceChildren();host.hidden=!message;if(!message)return;
  const advice=manufacturingAdvice(message);
  const title=document.createElement('h3');title.textContent='İndirmeden önce bunu düzeltelim';host.append(title);
  const reason=document.createElement('p');reason.textContent=advice.reason;host.append(reason);
  const list=document.createElement('ol');host.append(list);
  for(const [id,text] of advice.steps){
    const li=document.createElement('li'),span=document.createElement('span');span.textContent=text;li.append(span);
    const field=document.getElementById(id);
    if(field){const button=document.createElement('button');button.type='button';button.className='btn';button.textContent='İlgili ayara git';
      button.addEventListener('click',()=>{
        const tab=field.closest('[data-tab]');if(tab)switchTab(tab.dataset.tab);
        for(let parent=field.parentElement;parent;parent=parent.parentElement)if(parent.tagName==='DETAILS')parent.open=true;
        field.scrollIntoView({block:'center',behavior:'smooth'});field.focus({preventScroll:true});
      });li.append(button);}
    list.append(li);
  }
  const details=document.createElement('details'),summary=document.createElement('summary'),raw=document.createElement('p');
  summary.textContent='Hata ayrıntısı';raw.textContent=message;details.append(summary,raw);host.append(details);
  const retry=document.createElement('p');retry.textContent='Düzelttikten sonra Üretim önizlemesi ile kontrol et, ardından ZIP’i tekrar indir.';host.append(retry);
}
