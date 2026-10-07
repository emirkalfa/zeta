/* Contextual help: original explanations + traceable primary sources. */
(() => {
  const sources = {
    lift: ['NASA · Kaldırma denklemi', 'https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/lift-equation/'],
    drag: ['NASA · İndüklenmiş sürükleme ve açıklık oranı', 'https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/induced-drag-coefficient/'],
    profile: ['NASA · NACA profil geometrisi', 'https://ntrs.nasa.gov/citations/19970008124'],
    tunnel: ['UIUC · Düşük Reynolds sayısında rüzgâr tüneli verileri', 'https://m-selig.ae.illinois.edu/uiuc_lsat.html'],
    stability: ['MIT OpenCourseWare · Statik kararlılık', 'https://ocw.mit.edu/courses/16-333-aircraft-stability-and-control-fall-2004/resources/lecture_2/'],
    power: ['MIT · Güç, menzil ve havada kalış', 'https://ocw.mit.edu/ans7870/16/16.unified/propulsionS04/Mud/P4newmud.html'],
    endurance: ['MIT · En az güç ve havada kalış', 'https://web.mit.edu/16.unified/www/FALL/thermodynamics/notes/node99.html'],
    prop: ['UIUC · Ölçülmüş pervane performansı', 'https://m-selig.ae.illinois.edu/props/propDB.html'],
    print: ['Prusa · Modelleri nesne ve parçalara ayırma', 'https://help.prusa3d.com/article/split-to-objects-parts_1751'],
    method: ['ZETA · Yöntemler, varsayımlar ve denetim', '/static/references.html'],
  };
  const entries = {
    wingspan: ['Sol kanat ucundan sağ kanat ucuna yatay uzaklıktır. Metre girin: 150 cm = 1,5 m. Otomatik modda kanat alanı S = b²/AR ile boyutlandırılır; AR = 7 (standart) veya 6 (yarışma) ZETA başlangıç tercihidir.', ['drag','method']],
    weight: ['Pil, motorlar, elektronik ve tüm basılı parçalar dahil toplam uçuş kütlesidir. Kilogram girin. Kaldırma hesabında W = m × 9,81 N kullanılır. Bu değer baskı hacminden otomatik tartılmaz.', ['lift','method']],
    airfoil: ['Kanadın kesitini belirler. NACA 2412: %2 kamburluk, kamburluk konumu %40 veter, %12 kalınlık. Geometri NACA bağıntısından üretilir. CLmax, stall açısı ve profil sürüklemesi yaklaşık tahmindir; seçtiğiniz profil/Re için ölçülmüş polar yerine geçmez.', ['profile','tunnel']],
    htailAirfoil: ['Yatay kuyruğun, V kuyrukta ise iki eğik yüzeyin kesitidir. Boylamsal kararlılık hesabında bu profilin kaldırma eğimi kullanılır.', ['profile','stability']],
    vtailAirfoil: ['Dikey kuyrukların kesitidir. V kuyruk, yatay kuyruk profilini kullanır. ZETA bu seçimden yönelme veya dinamik kararlılık onayı üretmez.', ['profile','stability']],
    lblWingShape: ['Kanadın üstten görünüşünü seçer. Konik kanatta uç veter kökten küçüktür; dikdörtgende eşittir; düz firar kenarlıda arka kenar düz kalır. S = b × (kök + uç veter) / 2.', ['drag','method']],
    lblWingPos: ['Kanadı gövdenin alt, orta veya üst bölgesine taşır. Yuvalar ve iç destekler gövdenin gerçek kesitinden yeniden oluşturulur. Kanat motorları aynı hareketi izler; gövde motoru yerinde kalır. Yüksekliğin ayrıntılı aerodinamik girişim etkisi çözülmez.', ['method','stability']],
    lblTailType: ['Standart gövdede klasik, T ve V; çift bomlu gövdede H, üst köprü ve ters V yerleşimidir. V kuyruğun boylamsal etkin alanı S cos²(35°), yönelme eşdeğeri S sin²(35°) kabul edilir. Bu eşdeğerlik yaklaşık ön boyutlandırmadır.', ['stability','method']],
    lblFuseType: ['Hazır gövde koleksiyonunu veya kendi kesitlerinizi kullanın. Atlas, Seyir ve Akın özgün ZETA şekilleridir; test edilmiş bir üretici uçağının kopyası değildir. Şekle özel CFD/sürükleme polarları bulunmaz.', ['method']],
    cgSlider: ['Ağırlık merkezinin ortalama aerodinamik veterin (MAC) ön kenarından geriye olan konumu. %25 başlangıç değeridir. Gerçek pil ve motor yerleşimini tartarak doğrulamalısınız. Statik marj = nötr nokta − CG; hesap kuyruk ve kanat aerodinamik merkezleri arasındaki kolu kullanır.', ['stability']],
    reynolds: ['Re = ρ V c / μ: akış hızı, yoğunluk ve veterle değişen boyutsuz sayıdır. Örneğin 20 m/s hız ve 0,20 m veterde deniz seviyesinde yaklaşık 274.000. ZETA bunu hızla otomatik güncellemez; analiz için tek bir değer kullanır.', ['tunnel','method']],
    maxAlpha: ['Hücum açısı, kanat ile hava akışı arasındaki açıdır. Grafik −5° ile girdiğiniz üst sınır arasında çizilir. Ayrılma/stall sonrası bölüm deneysel veri değildir; çizilen tepe gerçek CLmax ölçümü sayılmaz.', ['lift','tunnel']],
    lblMission: ['Genel model veya çift bomlu yarışma yerleşimini seçer. Yarışma hedefleri örnektir; herhangi bir güncel yarışma şartnamesiyle otomatik uygunluk denetimi yapılmaz.', ['method']],
    motorPower: ['Tüm motorların toplam elektrik giriş gücü. İki adet 400 W motor için 800 W girin. Aerodinamik kullanılabilir güç = elektrik gücü × toplam tahrik verimi; motor çapı güç yerine geçmez.', ['power','prop']],
    propEfficiency: ['ESC, motor ve pervanenin birlikte elektrik gücünü faydalı itki gücüne dönüştürme oranı. %60 örnek varsayımdır. Gerçek verim hız ve pervaneye bağlıdır; üretici/tezgâh ölçümü varsa onu kullanın.', ['prop','power']],
    batteryWh: ['Nominal gerilim × kapasite (Ah). 14,8 V × 5 Ah = 74 Wh. Hesap enerjinin %80’ini kullanılabilir kabul eder; bu ZETA rezerv varsayımıdır. Seyir süresi = kullanılabilir Wh / toplam elektrik tüketimi × 60.', ['endurance','method']],
    avionicsPower: ['Motorlar dışındaki sürekli elektrik tüketimi: otopilot, kamera ve bilgisayar. Seyir tüketimine eklenir; menzil için en uygun hızın hesabına da katılır.', ['endurance','power']],
    nLimit: ['Yapının taşıdığı kuvvetin ağırlığa oranı. 4 g, ağırlığın dört katı yük demektir. Bu giriş bir dayanım testi değildir; hesap sadece dönüş eğrisini bu sınırla kısıtlar.', ['stability','method']],
    targetEndurance: ['Hedeflenen en az seyir süresi, dakika. %10 yakınlık sınırda gösterilir; hedef karşılandı sayılmaz.', ['endurance','method']],
    targetTurnRate: ['Hedeflenen sürekli dönüş hızı, derece/saniye. Güç, stall ve girilen yapısal g sınırı birlikte değerlendirilir.', ['power','method']],
    targetStall: ['Göreviniz için kabul ettiğiniz en yüksek stall hızı. Vs = √(2mg / (ρ S CLmax)). 15 m/s tek başına “uçamaz” anlamına gelmez; kalkış ve iniş koşullarıyla değerlendirilir.', ['lift','method']],
    motorLayout: ['Tek motor gövdede, çift motor iki kanatta montaj oluşturur. Savaşan İHA tek motoru arkadan iticidir. Motor ve pervane satın alınan parçadır; ZIP yalnız montaj taşıyıcılarını içerir.', ['method']],
    motorPattern: ['Çapraz düzen iki karşılıklı delik çifti; dikdörtgen düzen dört köşe deliğidir. Aralıkları motorun kendi teknik çiziminden veya kumpasla ölçerek girin. Model bilinmediği için üretici ölçüsü varsayılamaz.', ['method']],
    motorDiameter: ['Motorun dönen dış gövdesinin uçtan uca çapı. Savaşan İHA’da tek arka motorun gövde sonu ve plakası bu çapa uyarlanır. Vida düzeni bu dairenin içine sığmalıdır.', ['method']],
    motorLength: ['Montaj yüzeyinden motorun ön yüzüne kadar eksen boyunca mesafe; mil ve pervane adaptörü için ayrıca pervane mesafesi girilir.', ['method']],
    motorSpacingY: ['Dikey delik merkezleri arasındaki mesafe; deliğin kenarından değil merkezinden ölçün. Vida düzeni seçimiyle birlikte teknik çizime uydurun.', ['method']],
    motorSpacingZ: ['Yatay delik merkezleri arasındaki mesafe. Motor boyutunu değiştirmek bu gerçek vida aralığını kendiliğinden değiştirmez.', ['method']],
    motorScrew: ['Motorun metal dişine uygun vidanın nominal çapı. M3 için 3 mm. STL plastikten vida dişi üretmez; geçme deliği açar. Vida boyunu gerçek motorun izin verdiği diş derinliğiyle seçin.', ['method']],
    motorBore: ['Motorun arka mili veya çıkıntısına yer açan merkez deliği. Çıkıntının çapını ve geçme boşluğunu kontrol edin.', ['method']],
    motorPlate: ['Motoru taşıyan basılı plakanın kalınlığı. Kalınlık geometrik bir girdidir; yük, ısı ve titreşim dayanımı ayrıca ölçülmelidir.', ['print','method']],
    motorWire: ['Motor kablolarının geçtiği deliğin çapı. Kablo demetini ve koruyucu kılıfı birlikte ölçün.', ['method']],
    propDiameter: ['Dönen pervanenin uçtan uca çapı. İnç ölçüsünü 25,4 ile çarparak mm’ye çevirin. Önizlemedeki daire pervane süpürme alanını gösterir; basılacak pervane değildir.', ['prop','method']],
    propOffset: ['Motorun ön yüzünden pervanenin döndüğü düzleme kadar mesafe. Adaptör ve somun yerleşimini bu değere katın.', ['method']],
    motorStation: ['Çift motorun her yarım kanat üzerinde kökten uca konumu. %40, yarım açıklığın %40’ıdır. Kanat değişince konum taşınır; motor ölçüleri sabit kalır.', ['method']],
    wallThickness: ['Basılı gövde/kanat/kuyruk kabuğunun et kalınlığı. 0,8–4 mm desteklenir. Dilimleyicideki çevre çizgisi, nozül ve malzeme ile birlikte seçin; bu değer dayanım onayı değildir.', ['print','method']],
    ribSpacing: ['Kanat içindeki kesit destekleri arasındaki mesafe. Küçük aralık daha fazla destek ve ağırlık getirir; yük analiziyle seçilmelidir.', ['print','method']],
    ribThickness: ['Kanat içindeki kesit desteklerinin kalınlığı. Baskı yönü ve katman yapışması gerçek dayanımı etkiler.', ['print','method']],
    sparMainDia: ['Veterin %28’inde açılan ana boru kanalının çapı. Satın aldığınız borunun dış çapını ve geçme boşluğunu hesaba katın. 0 girilirse kanal eklenmez.', ['method']],
    sparRearDia: ['Veterin %62’sindeki arka boru kanalı. Boru ZIP’te bulunmaz. Her kanat yarısının borusu kendi eksenindedir.', ['method']],
    printBedX: ['Yazıcının kullanılabilir X baskı genişliği. Klips, brim ve destek için gereken alanı toplam tabla ölçüsünden düşerek girin. Model büyüyünce STL sayısı otomatik artar.', ['print','method']],
    printBedY: ['Yazıcının kullanılabilir Y baskı derinliği. Parçalar bu hacme göre döndürülür ve gerekirse birden fazla yönde bölünür.', ['print','method']],
    printBedZ: ['Yazıcının kullanılabilir Z yüksekliği. STL’ler tabla seviyesine yerleştirilir; destek/katman ayarları dilimleyicide yapılır.', ['print','method']],
    fitClearance: ['Erkek parça ile yuvası arasındaki toplam ölçü farkı. 0,30 mm, iki yana yaklaşık 0,15 mm boşluktur. ZIP’teki küçük geçme kuponlarını önce basarak ayarlayın.', ['print','method']],
    mountScrew: ['Kanat/kuyruk ve kapak montajında kullanılan metrik vidanın nominal çapı. STL’ye geçme deliği ve karşı somun cebi işlenir.', ['method']],
    mountNutFlat: ['Altıgen somunun karşılıklı düz yüzleri arasındaki mesafe. Köşeden köşeye ölçü değildir. Satın aldığınız somunu ölçün.', ['method']],
    mountNutHeight: ['Somunun eksen boyunca kalınlığı; somun cebinin derinliğini belirler.', ['method']],
    fuseWidthScale: ['Seçili gövdenin genişliğini yüzdeyle değiştirir. %100 modelin başlangıç oranıdır. Gerçek montaj yuvaları yeni kesitten hesaplanır. Aerodinamikte gövdeye özel CFD çözümü yoktur; genel sürükleme payı kullanılır.', ['drag','method']],
    fuseHeightScale: ['Seçili gövdenin yüksekliğini değiştirir. Üst/alt kanat bağlantıları gerçek kesit yüksekliğini izler. Hacimden otomatik kütle veya CG hesaplanmaz.', ['method']],
  };
  const manual={root_chord:'Kanadın gövde yanındaki ön ve arka kenarı arası mesafe.',tip_chord:'Kanat ucundaki ön ve arka kenar arası mesafe.',sweep:'Kanadın geriye süpürme açısı. Düz firar kenarlı seçenekte arka kenar hizası şekli belirler.',dihedral:'Önden bakıldığında kanadın yukarı eğimi.',htail_span:'Yatay kuyruğun toplam açıklığı.',htail_root:'Yatay kuyruğun kök veteri.',htail_tip:'Yatay kuyruğun uç veteri.',htail_sweep:'Yatay kuyruğun geriye süpürme açısı.',vtail_span:'Dikey kuyruğun yüksekliği; V kuyrukta iki eğik panelin toplam fiziksel açıklığı.',vtail_root:'Dikey veya V kuyruğun kök veteri.',vtail_tip:'Dikey veya V kuyruğun uç veteri.'};
  for(const [key,text] of Object.entries(manual))entries['man_'+key]=[text+' Alan boşsa otomatik tasarımın ilgili ölçüsü kullanılır. Metre veya derece birimini alanın yanında kontrol edin.',['method','stability']];
  let opener;
  const dialog=document.getElementById('infoDialog');
  function category(node) {
    const tab=node.closest('.tab-pane')?.dataset.tab;
    return tab==='charts'?['lift','drag','tunnel']:tab==='flight'?['stability','method']:tab==='mission'?['power','endurance']:tab==='stl'?['print','method']:['method'];
  }
  function openInfo(node,key,title) {
    opener=document.activeElement;
    const sectionKey=/^sec_\d+_(pos|w|h)(?:_inp)?$/.exec(key)?.[1];
    const sectionText={pos:'Kesitin burun ucundan geriye doğru konumu, metre. Kesit sırası gövdenin boyuna şeklini belirler.',w:'Bu kesitte gövdenin toplam genişliği, metre. Sol ve sağ dış yüzey arasındaki mesafedir.',h:'Bu kesitte gövdenin toplam yüksekliği, metre. Alt ve üst dış yüzey arasındaki mesafedir.'};
    const entry=entries[key]||(sectionKey?[sectionText[sectionKey]+' Yakın kesitler arasındaki ani ölçü farkları keskin geçişler oluşturur. Önizleme ve STL bu kesitleri birlikte kullanır.',['method']]:null);
    const context=node.closest('.field,.fuse-row,.settings-card,.form-section,.chart-box,.page-head,.fuse-properties,.stl-row')||node.parentElement;
    const paragraphs=[entry?.[0]||'Bu ayar ZETA ön tasarım modelinin bir parçasıdır. Aşağıdaki yöntem notlarında kapsamı ve sınırlamaları açıklanır.'];
    for(const hint of context.querySelectorAll('.hint:not([role="status"]),.form-section-head p,.page-desc,.stl-note')) {
      const text=hint.textContent.trim();if(text&&!paragraphs.includes(text))paragraphs.push(text);
    }
    if(node.matches('.page-head h2'))for(const hint of node.closest('.tab-pane').querySelectorAll('.stl-note')){
      const text=hint.textContent.trim();if(text&&!paragraphs.includes(text))paragraphs.push(text);
    }
    document.getElementById('infoTitle').textContent=title;
    const body=document.getElementById('infoBody');body.replaceChildren();
    for(const text of paragraphs){const p=document.createElement('p');p.textContent=text;body.append(p);}
    const list=document.getElementById('infoSources');list.replaceChildren();
    for(const ref of (entry?.[1]||category(node))) {
      const li=document.createElement('li'),a=document.createElement('a');
      [a.textContent,a.href]=sources[ref];a.target='_blank';a.rel='noopener noreferrer';li.append(a);list.append(li);
    }
    dialog.showModal();
  }
  function attach(node,key) {
    if(node.dataset.helpReady)return;node.dataset.helpReady='true';
    const title=node.textContent.trim();const b=document.createElement('button');
    b.type='button';b.className='info-dot';b.textContent='i';b.setAttribute('aria-label',title+' hakkında bilgi');b.setAttribute('aria-haspopup','dialog');
    b.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();openInfo(node,key,title);});
    if(node.tagName==='SUMMARY'){node.append(b);return;}
    const wrap=document.createElement('div');wrap.className='label-info-row';node.before(wrap);wrap.append(node,b);
  }
  function enhance() {
    document.querySelectorAll('label[for]').forEach(node=>attach(node,node.htmlFor));
    document.querySelectorAll('.field-label[id]').forEach(node=>attach(node,node.id));
    document.querySelectorAll('.form-section-head h3,.settings-card > summary,.page-head h2,.chart-box h3,.fuse-properties > h3,.stl-part h3').forEach(node=>attach(node,node.id||''));
    document.querySelectorAll('.hint:not([role="status"]):not(#modelPreviewStatus):not(#manufacturingStatus),.form-section-head p,.stl-note').forEach(node=>{node.classList.add('context-help-text');});
  }
  document.getElementById('infoClose').addEventListener('click',()=>dialog.close());
  dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}});
  dialog.addEventListener('close',()=>opener?.focus());
  enhance();
  const observer=new MutationObserver(()=>{observer.disconnect();enhance();observe();});
  function observe(){observer.observe(document.getElementById('app'),{childList:true,subtree:true});}
  observe();
})();
