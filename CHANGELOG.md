# Changelog

## [3.5.37] - 2026-10-19
- Geometrik ölçü kartlarında sayı ve birimler düz metin olarak oluşturulur; hassasiyetleri tutarlıdır ve dar ekranlarda birlikte kalır. Eksik veya geçersiz sayılar çizgiyle gösterilir.
- Önizleme, ZIP ve tek STL istekleri arasında geçişte doğrulanmış montaj/dilim bilgilerinin önbellekte kaybolması giderildi.
- Tek STL (mm) simülasyon dışa aktarımı, kesişen dış kabukları iç yüzey bırakmadan birleştirir; baskı ZIP paketi ayrı tutulur.
- İç kanat geçmeleri, güçlendirilmiş kök bağlantıları, ayarlanabilir karbon kanalları ve ortak kapak/gövde yüzeyi geliştirmeleri GitHub sürümüne dahil edildi.
- Ölçülerin masaüstü/telefon gösterimi, önbellek sıralaması ve simülasyon çıktısı için regresyon kontrolleri eklendi.

## [3.5.34]
- Servis kapakları ve yuvaları, kanat kökü eklenmiş ortak gövde dış yüzeyinden kesilir. Özellikle yüksek kanatta eski dar gövdeden üretilen kapağın kök geçişi altında kalması giderildi.
- Kapak çevresindeki gövde kabuğu ortak yüzeyden yeniden oluşturulur; karbon boru kesimleri, iç kanat boşlukları ve montaj yuvaları korunur.
- Kapak ve yanındaki gövde arasında gerçek yüzey yüksekliği ölçümüyle süreklilik testi eklendi.

## [3.5.33]
- Gövdenin sabit kanat kök geçişindeki fazladan ön omuz kaldırıldı; geçiş gerçek kanat planformunu izler.
- Kök geçişi ve kanat yuvasının dış yüzeyi tek sürekli loft olarak oluşturulur; üst üste binen cidarlar kaldırıldı. İç bağlantılar, sökme boşluğu ve karbon kanalları korunur.

## [3.5.32]
- Ana ve arka karbon boru kanalları, konik kanadın kök ve uç veter oranlarını izleyen düz hatlara hizalandı; arka kanalın kökten kısa mesafede bitmesi giderildi. Kanat cidarı ve hareketli yüzey menteşe boşlukları korunur.
- Ana borunun kök konumu ayarlanabilir; iki kanalın çap ve konum değerleri STL geometrisine ve yakın plan seçicisine aktarılır. Eski proje dosyalarına yalnız eksik yeni alan için %28 başlangıcı eklenir.
- Boru/kök pimi çakışması engellenir. Gerçek STL dosyalarındaki delikler ve flap/aileron hareket boşlukları tüm model ailelerinde kontrol edilir.

## [3.5.31]
- Servis kapaklarının düz yatağına ek olarak gövdenin gerçek iç tavan eğrisini izleyen alt bindirme eklendi; kapak çevresinden içeri bakan derin açıklıklar kapatıldı. Geçme boşluğu, bağımsız sökme ve sekiz montaj vidası korunur.
- Son gövde kesiminde bindirmenin silinmesi önlendi. Tüm altı gövde ailesi, kanat türleri ve seçilebilir konumlar için montajlı tavan örtüşme testi eklendi.

## [3.5.30]
- Penta V-kuyrukta alt sınır hesabının boş liste hatası giderildi; yatay ve V yüzeylerin gerçek dünya geometrisi kullanılır.
- Vidalı sabit kanat dilimleri, parçayla bütünleşik iç geçme dilleri ve karşı yuvalarla birleşir. Her ana birleşimde dört kilitleme vidası; ayrı dilim köprüsü yoktur. Karbon boru kanalları korunur.
- Gerçek kanat birleşiminden kesilmiş erkek/dişi baskı numuneleri STL paketine eklendi.
- Gövde-kanat kök iç bağlantısı en az 5 mm kalınlığa ve 16 mm genişliğe çıkarıldı; vida yatakları genişletildi. Kullanıcı parametreleri ve proje dosyası biçimi korunur.

## [3.5.29]
- Uzun servis kapağı, arada sabit gövde köprüsü bulunan iki bağımsız kısa kapağa ayrıldı. Her kapakta dört vida, somun yuvası ve sürekli oturma çerçevesi bulunur. Önizlemede kapaklar ayrı gizlenebilir; ZIP içinde ayrı STL olarak verilir.

## [3.5.28]
- Elevator, rudder ve ruddervator kumanda kolları da geniş tabanlı, yuvarlatılmış iki delikli tasarıma geçirildi.

## [3.5.27]
- Tüm kanat modellerinde flap/aileron kumanda kolları: geniş iç yük yayma tabanı, yuvarlatılmış daralan kontur ve en az 4 mm kalınlık. İki Ø2 mm bağlantı deliğiyle mekanik oran seçimi; önizlemede her iki deliğe yakınlaştırma.
- Kuyruk kolları korunur. Ortak hareket ve STL geometri kontrolleri uygulanır.

## [3.5.26]
- Normal gövde modellerine üç tekerli iniş takımı için bir ön merkez, iki ana M3 bağlantı yuvası eklendi. Ana yuvalar hesaplanan ağırlık merkezinin arkasına, ön yuva kamera hacminden uzağa yerleştirilir.
- Montaj yuvaları, geçme delikleri ve somun cepleri gövde önizlemesine ve STL’ye dahildir; teker ve taşıyıcılar haricen temin edilir.

## [3.5.25]
- VTOL basılı iniş ayakları kaldırıldı. Her iki gövdede harici ayak montajı için iki ön ve bir arka merkez vida yuvası, M3 geçme delikleri ve içeriden erişilen somun cepleri bulunur.
- Önizleme ve STL yalnız gövde montaj yuvalarını içerir; ayak parçası üretilmez.

## [3.5.24]
- Tria ve Penta için dışa açılan dört vidalı iniş ayağı: ayrı STL, gövdede kalın bağlantı yuvası, M3 geçme delikleri ve içeriden erişilen somun cepleri.
- Yerden boşluk gövde ve pervane ölçülerinden, Tria ön motorunun 90° konumundan hesaplanır. Varsayılan ağırlık merkezi ayak alanında kontrol edilir. Önizlemede ayak ve vida detayları bulunur.

## [3.5.23]
- Alçak Penta motor tablasının altında 10 mm derinliğinde geniş ve yumuşak geçişli bağlantı eklendi. Motor yüksekliği ve 8 mm düz üst tabla korunur; vida/mil ve boru boşlukları yeniden kesilir.

## [3.5.22]
- Penta yüksek motor kaideleri kaldırıldı; 8 mm düz tabla, doğrudan hafif kıvrımlı destek çubuğuna bağlanır. Eski yükseklik ayarı motorları yükseltmez. Boru üzerinde 2 mm boşluk, vida ve mil delikleri korunur.

## [3.5.21]
- Penta motor kaidelerindeki dört ayrı kule kaldırıldı; 5 mm cidarlı, yuvarlatılmış tek parça içi boş kaide eklendi. Düz 14 mm tabla, mil ve vida delikleri korunur; oval servis açıklıkları donanım erişimi sağlar.

## [3.5.20]
- Penta kapak çevresindeki tümsek/çukur yapan üst yüzey daraltması kaldırıldı; ortak, akıcı üst yüzey eğrisi STL ve önizlemeye uygulandı.

## [3.5.19]
- Penta kaldırma motoru taşıyıcıları: 20 × 32 mm oval, 5 mm cidarlı destek çubuğu; 14 mm motor tablası ve genişletilmiş yuvarlak ayaklar.
- Kalınlaştırılmış dört taşıyıcı ribin vida delikleri ve tamamlanmış kanatla boşluğu korunur. Önizleme ve STL aynı geometriyi kullanır.

## [3.5.18]
- Penta supports high, middle and low wing placement. Lift motor rails and mounting holes follow the actual wing frame; motor, propeller and tail collision checks remain enforced.
- Replaced the fixed 1 m Penta tube with one automatically sized short pod. Span, root chord, motor envelope and a documented conceptual fineness preference determine its dimensions. These are design assumptions, not certified universal aviation ratios.
- Pusher remains at the short pod's rear, independently of the twin-boom tail. Motor length and propeller offset set minimum tail clearance before tail-volume sizing. Preview and STL use the same pod and motor face.
- Changing Penta wing dimensions, position or pusher hardware automatically recalculates geometry while retaining the selected page. Existing project data and Tria geometry are preserved.
- Large Penta tail bridges keep their continuous backbone below the real stabilizer profile. Narrow seams can use one long keyed bridge with four screws, two per tile. Automatic wing splitting can search more non-uniform chord plans and merge adjacent tiles only when their actual solid fits the printer.
- Prevented duplicate root-fairing unions and kept the Penta root cavity inside its expanding exterior. Strict STL closure and printer-fit checks are unchanged.


## [3.5.17]
- Penta lift motor rails use broad rounded feet, four tapered ribs and 10 mm motor plates; the pusher firewall is at least 10 mm. Real motor screw holes and shaft clearance remain open.
- Penta tail sizing now includes the selected pusher motor length, propeller offset and a 40 mm longitudinal clearance before sizing the tail surfaces. Saved manufacturing requests receive the same minimum clearance.
- Lowered the Penta upper wing-body roof and reduced the upper root shoulder bulge; preview and printable geometry share the same shape.

## [3.5.16]
- Isolated content scrolling from icon navigation. All eight pages start at the top when selected, including after scrolling a long parameter form and in narrow windows.
- Disabled scroll anchoring in the content area and versioned layout assets to avoid stale desktop browser styles.

## [3.5.15]
- Penta VTOL uses one canonical 1 m by 180 mm by 140 mm body and fixed middle wing placement. Saved custom sections, body scaling and motor diameter cannot distort its body; wing span/shape and mounting hardware remain adjustable.
- Both VTOL bodies use actual body-envelope C2 wing shoulders for rectangular, tapered and straight-trailing-edge planforms. Recessed airfoil seats, single retaining pins and bolted internal root straps are retained in the preview and STL.
- Preview and manufacturing share canonical fixed-body coordinates; Penta dual-boom geometry and aerodynamic centers use its fixed wing station before tail sizing.

## [3.5.14]
- Removed an extra closing div left by moving the stall target input. Every result tab remains inside the main application layout, so calculating opens visible content beside the sidebar instead of pushing it below an empty full-height container.
- Added structural and actual-browser checks for tab ownership, results visibility and screen position.

## [3.5.13]
- Recalculating explicitly releases both old WebGL contexts in addition to their scene resources, preventing unused renderers from accumulating GPU contexts.

- Recessed wing-root sockets reserve the entire insertion key and beam length. Cambered wing keys no longer intersect the fixed cuff and falsely reject every internal bolted brace position. The common correction applies to every fuselage family and wing planform.
- Retaining pins, internal bolted root straps, flush external contours and strict closed STL checks are retained.

## [3.5.12]
- Automatic wing area respects total mass and the chosen stall-speed limit using the selected profile/Reynolds estimate. The established aspect-ratio planform remains a minimum; span, body dimensions and manual dimensions are preserved.
- All tail families use actual wing/tail quarter-chord centers for sizing and stability. Horizontal and vertical arms are calculated separately; coupled T/twin-fin layouts are iterated and V-tails meet both equivalent volume targets.
- The stall-speed input is available with the first dimensional inputs and remains part of saved/imported projects. Its information dialog documents preliminary CLmax, sea-level density and the sizing rule.
- Reported wing area/MAC and boom positions match the preview/STL panel dimensions without avoidable millimetre rounding discrepancies.

## [3.5.11]
- All fuselage families and high/mid/low wing positions use the same hollow C2 center-wing shoulder and recessed airfoil seat. Detachable skins meet the fixed cuff without an outside ridge; root pins and bolted straps remain functional.
- Twin motor nacelles receive hollow smooth shoulders sized from the actual airfoil at the motor station. Servo/service openings, motor holes and purchased motor dimensions remain unchanged.
- Penta lift rails use widening rounded wing landings and rounded motor support walls, with original clamp bores and tool access retained.

## [3.5.10]
- Tria motor plates are 10 mm thick and front mounting pads 14 mm thick. Rounded support lofts widen to 90 mm at the wing and extend farther into the airfoil. The common mechanism covers rectangular, tapered and straight-trailing-edge wings.
- Both wing roots receive separate internal bolted straps, matched screw bores and captive nut pockets in the actual body/wing STL pieces. Root pins remain in place; the assembly guide identifies the joined filenames.
- Detailed preview smooth shading applies to all body and fixed wing shells, independent of wing planform. Internal view retains root straps in opaque pastel purple.
- Filtered ZIP exports reuse the same reinforced geometry as the full preview and complete ZIP.

## [3.5.9]
- Replaced the underside cross braces with two internal axial straps. Each strap crosses the actual incoming cut of the carbon-socket body slice and bolts to that slice and its preceding main-body slice; screw holes, captive nut pockets and fit checks are included in STL and preview.
- Previous transverse brace parts and their bosses are no longer generated. Assembly instructions identify both joined slice filenames; internal structure view keeps the new axial straps opaque for inspection.


## [3.5.8]
- Widened both Tria front motor wing supports: screw landing 26 to 36 mm, tapered wing-root end 48 to 72 mm. Servo cavity, screw coordinates and movement range are retained.


## [3.5.7]
- Actual longitudinal splits at the Tria fuselage carbon-tube socket receive two separate underside cross braces, reinforced skin bosses, bolt bores and inside-accessible hex nut pockets. Braces connect both printed halves, preserve the tube bore and are included in preview, ZIP and assembly instructions.
- Front motor wing supports now widen through a rounded tapered loft into the wing, with rounded flat screw landings and mounting feet. Servo cavities, motor tilt envelope and metal hardware dimensions are retained.


## [3.5.6]
- STL preview and ZIP preparation use an accessible animated indeterminate progress bar; ready and error states have distinct pastel colors. No invented percentage is shown.
- Shortened preview status, cover and connection labels. VTOL parameters are grouped into expandable motor, placement, servo, carbon-tube and tail sections.
- Core aircraft parameters precede VTOL hardware; project management is a separate expandable section and Calculate remains accessible while scrolling.


## [3.5.5]
- Tria auto V-tail iterates the real wing/tail aerodynamic-center arm. Its explicit preliminary volume targets (Vh 0.45, Vv 0.03) replace the generic hidden targets; parameters, saved projects and help explain the assumptions. Manual tail dimensions are retained.
- Front motor pivots have thicker bearing sleeves, wider rounded connecting webs, a thicker motor plate and larger rounded fixed bearing cheeks; servo chamber and metal-pin/horn fit are retained.
- Rear motor supports have wider flared rounded webs into the carbon-tube clamp, retaining service access and hardware bores. Physical strength still requires load testing.


## [3.5.4]
- Removed the raised Tria wing-root fairing surface and its external cuff ridge.
- The fixed root cuff now follows the original wing outline; a recessed removable tongue fits under it with calibrated clearance. Single-pin retention and spar bores are preserved in preview and STL.
- Geometry tests check that the cuff stays within the airfoil envelope and has no interference with the detachable wing.


## [3.5.3]
- Tria auto V-tail keeps its equivalent area with an aspect ratio of four, replacing the excessively broad root chord. Manual tail dimensions remain explicit.
- The smooth center-wing transition no longer extends the trailing edge into the rear motor bay.
- Rear motor placement uses the actual exposed carbon-tube interval, allowing clearance for the clamp and propeller before the tail. Rear clamp and motor-case collisions are checked.
- Rear station now means percent of the usable tube bay; older projects migrate to its midpoint. The preview states the actual rear motor distance from the nose.


## [3.5.2]
- Fixed the Tria center-wing blend's non-manifold contact for wide cambered wings; STL edge validation remains strict.
- Tilt collision checks retain every angle and crop stationary geometry to the bounded motion region.
- Reuse validated print segmentation for the last two designs; preview and complete ZIP share the same printed parts.
- Faster STL edge counting and validated fallback to original geometry when simplification damages topology.


Tüm önemli değişiklikler bu dosyada belgelenir. Format [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) standardına uygundur ve proje [Semantic Versioning](https://semver.org/spec/v2.0.0.html) kullanır.

## [Unreleased]

## [3.5.1] - 2026-10-11

- Tria ana gövdesi sabit ve daha alçak bir profile alındı: 672 mm ana gövde, 170 mm azami en, 110 mm azami yükseklik. Gövde oranları, özgün kesit ve kanat yüksekliği ayarları bu modelde kapatıldı. Üretim sunucusu da sabit kesitleri yeniden oluşturur; eski ayarlar şekli bozmaz.
- Sabit orta kanat yerleşimi ve daha yumuşak 3D gövde görünümü; karbon boru, bağlantı delikleri ve servis parçaları korunur.
- Otomatik vidalı kanat dilimlemesi, bağlantıya uygun alternatif kesim düzlemlerini ve gerektiğinde ek dilimleri dener. 2 m / 4 kg / NACA 4412 / düz arka kenarlı Penta için hatalı üçüncü bağlantı yeni kesim yerleriyle çözülür; dört vida, engelsiz delikler ve yazıcı sınırları korunur.

## [3.5.0] - 2026-10-11

- Tria'nın basılı kuyruk uzantısı karbon boruyla değiştirildi. Gövdede kör yuva ve sıkma kulakları, ayrı kuyruk taşıyıcısında boru yuvası ve sıkma vidaları; arka motorda boruya uyan üst/alt kelepçe oluşturulur.
- Borunun dış/iç çapı ve gövdeye girme uzunluğu ayarlanır. Kuyruk geçmeleri boruya çarpmayacak şekilde dışa taşınır. Karbon boru ölçü referansı 3D'de görünür, satın alınır ve STL'ye eklenmez.
- Ön servo bölmesi kanattan uzanan içi boş kaportayla birleştirildi; servis kapağı korunur. Kaportanın aerodinamik etkisi ölçülmüş değildir.
- Motor üçgeni merkezi, varsayılan CG ve statik dikey itki payları gösterilir. Bu hesap gerçek CG, motor kapasitesi veya uçuş kontrolü doğrulaması değildir.

## [3.4.1] - 2026-10-11

- Tria VTOL ön mekanizması tamamen yenilendi: alçak pivot, yan servo bölmesi, metal servo kolu için dört delikli doğrudan bağlantı ve ayrı servis kapakları. Eski dış itme çubuğu düzeni kaldırıldı.
- Servo mil konumu, metal kol delik yarıçapı ve vida çapı ayarlanabilir; yeni delikler gerçek STL ve yakın plan listesinde bulunur. Servo ölçü referansı 3D'de gösterilir. Eski varsayılan 60 mm pivot yüksekliği 25 mm'ye taşınır; özel değerler korunur.
- Arka kelepçe, yumuşak merkez kanat ve beş motorlu Penta korunur. Fiziksel servo uyumu, tork ve yük doğrulaması yapılmamıştır.

## [3.4.0] - 2026-10-11

- Penta VTOL seçeneği: dört sabit kaldırma motoru, ayrı ölçülü arka itici motor, çift bom ve ikiz finli kuyruk eklendi.
- Kaldırma rayları kanat profilinin altına toleransla oturur; dört M3 bağlantı, somun cepleri, motor tablaları ve kablo geçişleri gerçek STL ve 3D üretim önizlemesinde görünür.
- Kaldırma yüksekliği ve kanat önü/arkası pervane boşluğu ayarlanabilir; çakışmalar üretim sırasında açıklanır. Üç motorlu Tria seçeneği korunur. Fiziksel yük ve uçuş testleri yapılmamıştır.

## [3.3.2] - 2026-10-11

- Tria VTOL gövde-kanat geçişi geniş, içi boş ve yumuşak daralan bir merkez kanatla birleştirildi. Sökülebilir kanat kökü dışa taşındı; pim, profil yuvası ve boru kanalları korunur. Aynı yüzey gerçek STL ve üretim önizlemesinde kullanılır.

## [3.3.1] - 2026-10-11

- VTOL ön motorların varsayılan kanat önü uzaklığı 150 mm'den 75 mm'ye indirildi.
- Arka motorun ince dikmeleri yerine iki geniş taşıyıcı duvar, ayrı üst eyer ve alt kelepçe eklendi. İki hizalama geçmesi, dört M3 bağlantısı, somun cepleri ve gövdede kaymayı sınırlayan halkalar gerçek STL parçalarına yansır. Arka yükseklik ayrı ayarlanır ve varsayılanı 35 mm'dir.
- Vida erişimi ve kablo geçişi korunur; ön motor hareketi 5 derece aralıklarla kanat, motor kasası ve sabit taşıyıcılarla kontrol edilir. Fiziksel dayanıklılık testi yapılmış değildir.

## [3.3.0] - 2026-10-10

- Tria VTOL özgün gövde seçeneği ve ayrı motor, pervane, pivot ve servo ölçüleri eklendi.
- İki bağımsız döner ön taşıyıcı, sabit arka motor tablası, kanat taşıyıcıları ve servo yuvaları gerçek üretim geometrisinde oluşturulur.
- Ana 3D görünümde bağımsız ön motor hareketi; delik yakın planları; parçalı STL ve proje dosyasında VTOL ayarları.
- Bu model mekanik prototiptir. Sabit kanat grafikleri hover/geçiş performansını doğrulamaz; hareket kontrolleri örnek açılarda yapılır.

## [3.2.7] - 2026-10-09

- İsimli proje kopyaları, yerel kayıt listesi ve listeden açma eklendi.
- Taşınabilir .zeta.json dosyası indirme ve bilgisayardan açma eklendi.
- Proje açılmadan mevcut tasarım otomatik yedeklenir; geometri ve üretim ayarları birlikte yüklenir.

## [3.2.6] - 2026-10-09

- Son tasarım ve üretim ayarları yerel veritabanına kaydedilir; eski tarayıcı kayıtları aktarılır.
- Manuel ölçüler ve hesaplama modu geri yüklenir; hesaplama yapılmadan değişiklikler otomatik kaydedilir.
- Tasarımı kaydet düğmesi ve görünür kayıt durumu eklendi.

## [3.2.5] - 2026-10-08

- STL önizleme ve indirme hesapları tek sırada yürütülür; bekleyen eski ölçüler atlanır, aynı istek paylaşılır.
- Görünmeyen 3D sekmeler ve arka plandaki pencere çizim yapmaz.
- Yeniden hesaplamada eski sahne geometrileri, malzemeleri ve gölge kaynakları serbest bırakılır.

## [3.2.4] - 2026-10-08

- Sol menü dar simge şeridine dönüştürüldü; menü adları fare ve klavye odağında açıklama olarak görünür.
- Koyu temada nötr koyu gri zemin, pastel simgeler, kartlar ve seçili durumlar.
- Arayüz yazılarındaki uzun ayırma çizgileri kaldırıldı.

## [3.2.3] - 2026-10-08

- Sabit kanatların yazıcıya göre oluşturulan dilim birleşimlerinde iki dar veya tek geniş gömme geçmeli köprü, dört vida deliği ve alttan erişilen somun cepleri.
- Köprüler ayrı STL dosyaları olarak ZIP’e eklenir; iki 3D önizlemede mor renkte gösterilir ve vida yakın plan listesinden seçilir.
- Dilim planı parça sayısını baskı hacmine göre artırır. Boru, gövde kökü, diğer montajlar ve kontrol yüzeyi hareketi bağlantı yerleşiminde korunur; yer bulunamazsa açıklamalı hata verilir.
- ZIP montaj kılavuzu köprü dosyalarını bağlandıkları kanat dilimleriyle eşleştirir. Geometri doğrulaması fiziksel yük/baskı testinin yerine geçmez.

## [3.2.2] - 2026-10-08

- Ölçü kartlarına iç boşluk eklendi; uzun metinler, değerler ve düğmeler dar ekranlarda satıra sığacak şekilde düzenlendi.
- Gövde sekmesi tüm gövde tiplerinde gerçek STL geometrisini gösterir; kanat konumu değişince yuva ve delikler iki önizlemede birlikte yenilenir.

## [3.2.1] - 2026-10-08

- Windows pencere ve masaüstü simgeleri yeni ZETA logosuyla eşitlendi; tarayıcı simgesi sürümlendirildi.

## [3.2.0] - 2026-10-08

- Tüm gövdelerde ölçüye göre burun altı kamera yuvası ve yan vida delikleri.
- Kanat köklerinde profil biçimli oturma yuvası ve her kanat yarısında tek sabitleme pimi.
- Gerçek STL önizlemesinde bağlantı deliklerine yakın plan seçimi.
- ZIP üretim hatalarında açıklamalı düzeltme adımları ve ilgili ayara erişim.
- Açık pastel tema, yenilenen kartlar ve mobil düzen.

## [3.1.0] - 2026-10-08

### Added
- Flap, aileron, elevator ve rudder/ruddervator artık ayrı STL parçaları. Metal pimli, karşılıklı menteşe gözleri ve Ø2 mm servo bağlantı kolları; pim çapı ve geometrik hareket açısı ayarlanabilir.
- 3D görünümde gerçek STL parçasını seçip pim ekseni etrafında hareket ettirme; ayrı kontrol parçaları ZIP'i ve menteşe deneme kuponları.
- Eğri gövdeyle düz kanat kökü arasındaki açıklığı dolduran sabit, içi boş kök parçaları. Kanat/gövde ölçüsü ve yüksekliğiyle birlikte yeniden oluşur.
- Çift bomda flap bölgeleri bom bağlantısının iki yanına ayrılır. Arka boru konumu ayarlanabilir; boru hareketli bölgeye girmeden sonlandırılır.

### Fixed
- Kanat/boru/menteşe ayarları yeniden açılışta korunur; eski logo dosyaları, ayrıntı hizaları ve koyu panel renkleri güncellendi.
- Uygulama, farklı sürümdeki çalışan sunucuyu yeni sürüm diye açmaz. Windows dosya sürümü ve macOS paket sürümü VERSION ile eşleştirildi.
- Çok küçük float32 kesim yüzeyleri yeniden manifoldlaştırılıp hacim ve kapalı yüzey kontrolleriyle doğrulanıyor.
- Akın gövdesinde kanat kökü kaplamalarının gövde kabuğuyla birleşimi düzeltildi; yüksek kanat ve V kuyruk dahil baskı geometrisi kapalı mesh olarak doğrulanıyor.

### Hardware
- Metal pim/mil, somunlar, servo ve itme çubukları satın alınır. Gerçek servo gövdesine özel yatak ve elektronik bağlantı bu modelin ölçülerinden çıkarılamaz; gerçek donanımla monte edilip ayarlanır. Paket geometrisi fiziksel dayanım/uçuş onayı değildir.

## [3.0.1] - 2026-10-08

### Fixed
- Boru kanalı çapı 0 girildiğinde yalnız ilgili kanal devre dışı bırakılıyor; arayüz ile üretim doğrulaması eşleşiyor.
- Hesap ayrıntılarında etiket, değer ve birimler ortak sütunlarda hizalanıyor; mobil ve koyu tema kontrolü eklendi.
- Eski açık/koyu logo dosyaları güncel simgeyle eşitlendi.
- Kanat konumu testlerinde gerçek boru kanalının açık olduğu hacim kesişimiyle doğrulanıyor.

### Scope
- Flap/aileron/elevator/rudder henüz bağımsız hareketli STL parçaları değildir; bu sürüm bunu tamamlanmış bir özellik olarak sunmaz.

## [3.0.0] - 2026-10-08

### ZETA Studio
- Yeni logolu, açık/koyu temalı sade arayüz; parametrelerin yanında birim, açıklama ve gerçek kaynakları açan bilgi düğmeleri.
- Atlas, Seyir, Akın ve Savaşan İHA gövdeleri; kanat/kuyruk bağlantıları, ayrı gövde kapağı, ölçüye göre tek/çift BLDC motor montajları ve servis kapakları.
- STL ile aynı üretim geometrisini gösteren 3D önizleme; yazıcı hacmine göre otomatik bölünen, ayrı STL dosyaları içeren montaj ZIP'i.
- Kuyruk kolu, güç dengesi, azami hız ve menzil hesabı düzeltmeleri; girdi doğrulaması ve varsayımları açık teorik ön değerlendirme.
- README güncel uygulama görüntüleri, doğrudan paket indirme bağlantıları ve ilk kullanım adımlarıyla yenilendi.
- Windows, Linux ve macOS için indirilebilir paketleri ve SHA256 dosyasını üreten yayın hattı korundu.

### Doğrulama ve kapsam
- 312 Python ve 28 JavaScript testiyle geometri, montaj, hesap ve çıktı denetimleri; yedi NACA profilinin yayınlanmış UIUC koordinatlarıyla karşılaştırması.
- Gerçek uçuş, baskı dayanımı veya ölçülmüş aerodinamik polar onayı değildir. Hareketli kontrol yüzeyleri/servo mekanizmaları bu sürümde tamamlanmamıştır.

## [2.1.0] - 2026-10-08

### Added
- Parametrelerin yanında açıklama ve NASA, MIT, UIUC kaynaklarını açan bilgi düğmeleri; uygulama içinde yöntem/varsayım sayfası.
- Sadeleştirilmiş açık/koyu arayüz, katlanabilir gelişmiş ayarlar, mobil düzen ve özgün ZETA simgesi.
- Windows paketinde Chrome/Edge uygulama penceresi; bulunamazsa varsayılan tarayıcı.
- UIUC koordinatlarıyla yedi NACA profilinin geometrik karşılaştırması ve ek hesap doğrulama testleri.

### Fixed
- Azami hız hesabındaki sabit tarama tavanı kaldırıldı; güç eşitliğinin kökü çözülüyor.
- Menzil için en uygun hız hesabına aviyonik tüketimi eklendi; erişilemeyen seyir hızları kullanılmıyor.
- Kararlılıkta görüntülenen kanat/kuyruğun aerodinamik merkezleri arasındaki gerçek kol kullanılıyor.
- Boş manuel kuyruk alanları otomatik ölçüleri devralıyor; kısa gövdede negatif silindir uzunluğu oluşmuyor.
- Hedefe %10 yakın sonuç artık hedef karşılandı sayılmıyor. Düşük pozitif statik marj ve yüksek stall hızı tek başına uçuş imkânsızlığı diye sunulmuyor.
- Geçersiz sayısal API girdileri anlaşılır hatayla reddediliyor. 1 g dönüş yarıçapında sonsuz JSON değeri üretilmiyor.
- Kullanılmayan eski dilimleme düğmeleri ve tekrarlanan indirme onayı kaldırıldı.

### Scope
- Grafikler ve performans sonuçları teorik ön değerlendirmedir. Şekle özel deneysel polar, yapısal dayanım ve gerçek uçuş doğrulaması içermez.

## [2.0.0] - 2026-10-03

### Added
- Kurulum gerektirmeyen masaüstü paketleri: Linux AppImage, Windows `.exe`, macOS `.app`. Uygulama tarayıcıda açılır, sekme kapanınca kendini kapatır, ikinci açılışta çalışan kopyaya gider.
- Çevrimdışı çalışma: three.js, Chart.js, ikonlar ve yazı tipleri depoda (`static/vendor`).
- CI/CD: üç işletim sisteminde test, her pakette duman testi, `v*` etiketiyle CHANGELOG notları ve SHA256 özetleriyle otomatik GitHub Release.
- Yarışma İHA'sı gövde yerleşimi (`airframe: combat`): itici pervane, kamera için boş burun, çift bom, ikiz dikey kuyruk ya da ters V kuyruk; daha düşük açıklık oranı ve daha büyük kanatçıklar. 3D model ve ölçüler bu yerleşime göre üretilir.
- Görev performansı adımı ve `/api/mission`: motor gücü ve bataryadan azami hız, havada kalış, menzil ve dönüş performansı; yarışma İHA'ları (Savaşan İHA vb.) için düzenlenebilir hedeflerle karşılaştırma ve örnek başlangıç değerleri.
- Uçabilirlik testi artık 150 W/kg varsayımı yerine girilen motor gücünü kullanıyor.
- Yeni logo ve favicon; README baştan yazıldı.
- Tek komutla başlatma: `start.sh` / `start.bat` sanal ortamı kurar, bağımlılıkları yükler ve tarayıcıyı açar. `app.py` `--port`, `--host`, `--no-browser` seçeneklerini alır; port doluysa sonraki boş portu seçer.
- İskeletli kanat STL'i: kanat içi boş üretilir, ayarlanabilir aralıkta rib'ler ve rib'lerden geçen ana/arka spar delikleri içerir (rib aralığı, rib kalınlığı ve delik çapları STL sayfasından ayarlanır).
- 3D model yenilendi: firar kenarında gerçek kontrol yüzeyi panelleri (flap, kanatçık, elevator, rudder), yuvarlatılmış kanat uçları, spinner ve pervane, zemin gölgesi.

### Changed
- Kullanılmayan `scipy` bağımlılığı kaldırıldı.
- Paketlenmiş uygulamada veritabanı kullanıcı veri dizininde tutulur.
- Uygulama alt bilgisinden ve README'den yapımcı adı kaldırıldı.
- Arayüz baştan tasarlandı: sade teknik tema (açık/koyu), numaralı adımlar, bölümlere ayrılmış parametre formu, gruplu ölçü tabloları, kriter tablolu uçabilirlik sayfası, satır tabanlı STL sayfası.
- 3D sahnede kamera ve ızgara modelin boyutuna göre kadrajlanıyor.
- Analiz grafikleri temaya uyuyor; sürükleme poları yalnızca stall öncesi noktaları çiziyor (`cd_vs_cl` noktalarına `stalled` alanı eklendi).
- `/api/stability` yanıtına yapısal `checks` listesi eklendi.
- Ayarlar çerez yerine `localStorage`'da saklanıyor.
- Ana 3D sahne ve gövde önizlemesi aynı model kurucuyu kullanıyor (`aircraftmodel.js`); `viewer3d.js` yaklaşık 1000 satır kısaldı.
- T-kuyrukta yatay kuyruk artık dikey kuyruğun tepesinde.
- `requirements.txt` sürüm alt sınırlarına geçti; varsayılan sunucu adresi `127.0.0.1`.

### Fixed
- Özgün gövde kesitlerinin genişlik/yüksekliği metre yerine oran gibi yorumlanıyordu; varsayılan gövde 1 m çapında çıkıyordu.
- Gövde sekmesi hesaplanan gövde ölçülerini eziyor, konvansiyonel gövde STL'i yanlış uzunlukla üretiliyordu.
- Duvar kalınlığı değişikliği yeniden hesaplama yapılmadan STL'e yansımıyordu.
- Statik marj "aşırı stabil" iken uçabilirlik kartı yeşil görünüyordu.
- Tema değiştirildiğinde grafik renkleri güncellenmiyordu.

## [1.2.3] - 2026-06-28

### Added
- Straight Trailing Edge (STE) tapered wing model: paralel olmayan LEAD ve TRA ile kanat geometrisi (#c357933).
- Modern MALE pod-boom gövde: superellipse kesit ve ventral pod desteği (#b67ddf7).

### Changed
- Pod-boom VTOL gövde kaldırıldı, sadece konvansiyonel gövde tutuluyor (#2b5948c).
- `*.egg-info` git izlemeden çıkarıldı (#5aab91e).

## [1.2.2] - 2026-06-22

### Added
- Reynolds sayısına bağlı kanat profili özellikleri: `cd_0`, `cl_max`, `cm_0` artık Re ile ölçekleniyor (`airfoil.py`).
- Ok açısı (sweep) düzeltmesi: lifting-line çözümüne Λ düzeltmesi eklendi (`analysis.py`).
- Post-stall modeli: maksimum CL sonrası davranış tanımlandı (`airfoil.cl`).
- Gövde (fuselage) mesh görselleştirmesi: `viewer3d.js`'de kesitler artık doğru hizalanıyor.

### Fixed
- Gövde mesh'inde mükerrer kesitler kaldırıldı, kanat gövdeye doğru pozisyonda birleşiyor.
- `wing_junction` kaldırıldı (kullanılmayan özellik).

## [1.0.2] - 2026-06-05

### Added
- Kanat ucu (tip cap) desteği: dilimlenmiş (sliced) ve dilimlenmemiş (thick) STL dışa aktarımda tüm kanat/kuyruk segmentlerine entegre tip cap eklendi.
- STL dosya adları İngilizleştirildi: `z_wing_*` ön eki kullanılıyor.
- Tip cap duvar kalınlığı artık `wallMeters` parametresine bağlı ve içe ofsetli.

## [1.0.0] - 2026-06-04

### Fixed
- **Dihedral hatası**: Kanat dihedral offset'i yanlışlıkla açıklık (Z) eksenine ekleniyordu. 2m kanat açıklığında ~10.5cm hata oluşuyordu (`viewer3d.js`, `geometry.py`). Dihedral artık dikey (Y) eksenine uygulanıyor, kanat açıklığı girilen değerle birebir eşleşiyor.

## [0.2.0] - 2026-06-04

### Fixed
- **lifting-line A matrisi**: `2b/(π·c·c_l_α)` yanlış katsayısı `4b/(c·c_l_α)` (Anderson Eq. 5.51) olarak düzeltildi. CL_α 3D hata payı %187'den **%1.2'ye** düştü.
- **analysis.py b_vec**: dead code (`b_vec[i] = alpha` üst satırı eziyordu) temizlendi, `α - α_L0` kullanıldı. NACA 2412 için CL@α=0 artık 0 yerine 0.175 (gerçek ~0.25).
- **airfoil.py α_L0**: numerik integral ile thin airfoil teorisinden hesaplanıp artık döndürülüyor. NACA 0012/2412/4412 için ±%4 doğrulukla referans değerlerle eşleşiyor.
- **airfoil.py cl_max**: heuristik `1.2 + m*2.0` yerine `1.5 + 4m - 1·max(t-0.12, 0)`. Hata payı %20'den **<%5'e** düştü.
- **airfoil.py cd_0**: Re-bağımsız `0.006 + t*0.02` yerine `0.0055 + 0.011t + 0.02m`. Hata payı %29-40'tan **%11-15'e** düştü.
- **airfoil.py cm_0**: sabit `-0.05 - m*0.1` yerine thin airfoil teorisinden `-(π/4)(A₁ - A₂)`. NACA 2412 için -0.05 yerine **-0.053** (gerçek -0.047).
- **stability.py d_eps/dα**: sabit 0.5 yerine `2·a_w/(π·AR)`. AR=5/7/10 için 0.571/0.444/0.333.
- **stability.py NP hesabı**: 2D `cl_alpha` yerine 3D `cl_alpha_3d` kullanılıyor.

### Added
- 19 yeni test (toplam 124): alpha_L0, cm_0, cl_max/cd_0 referans karşılaştırmaları, cambered CL@α=0, 3D CL_α eğimi, downwash AR-bağımlılığı, htail alan etkisi.
- `app.py` `/api/version` endpoint'i: `VERSION` dosyasını döner.
- `app.py` `/healthz` endpoint'i.
- `VERSION` dosyası (tek kaynak).
- `pyproject.toml` (PEP 621 metadata, `setuptools.dynamic.version`).
- `CHANGELOG.md`.
- `.github/workflows/ci.yml`: push/PR'da testler.
- `.github/workflows/release.yml`: `v*` tag'de GitHub Release.
- `.github/release-drafter.yml`: otomatik release notes.
- `scripts/bump_version.py`: semver atlama yardımcısı.
- `RELEASING.md`: release süreci dokümanı.

## [0.1.0] - 2026-05-23

### Added
- 3D model görüntüleme (Three.js, ışıklandırma + Vector3 bug fix).
- STL dosyaları milimetre cinsinden dışa aktarma (Cura/PrusaSlicer uyumlu).
- STL parça birleştirme için pim/delik sistemi kaldırıldı (yapıştırma/bantlama talimatı).
- 8 NACA profili: 0012, 2412, 4412, 2415, 0015, 4415, 23012, 6412.
- Lifting-line teorisi ile Cl, Cd, Cm grafikleri.
- Uçabilirlik testi (stall hızı, seyir hızı, tırmanma, statik stabilite).
- 105 birim test (pytest).
- SQLite veritabanı (NACA profil verileri).
- MIT lisansı.
- Karanlık mod, favicon, profil README.

[Unreleased]: https://github.com/emirkalfa/zeta/compare/v3.2.2...HEAD
[3.2.2]: https://github.com/emirkalfa/zeta/compare/v3.2.1...v3.2.2
[3.2.1]: https://github.com/emirkalfa/zeta/compare/v3.2.0...v3.2.1
[3.2.0]: https://github.com/emirkalfa/zeta/compare/v3.1.0...v3.2.0
[3.1.0]: https://github.com/emirkalfa/zeta/compare/v3.0.1...v3.1.0
[3.0.1]: https://github.com/emirkalfa/zeta/compare/v3.0.0...v3.0.1
[3.0.0]: https://github.com/emirkalfa/zeta/compare/v2.0.0...v3.0.0
[2.0.0]: https://github.com/emirkalfa/zeta/compare/v1.3.3...v2.0.0
[1.2.3]: https://github.com/emirkalfa/zeta/compare/v1.2.2...v1.2.3
[1.2.2]: https://github.com/emirkalfa/zeta/compare/v1.0.2...v1.2.2
[1.0.2]: https://github.com/emirkalfa/zeta/compare/v1.0.0...v1.0.2
[1.0.0]: https://github.com/emirkalfa/zeta/compare/v0.2.0...v1.0.0
[0.2.0]: https://github.com/emirkalfa/zeta/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/emirkalfa/zeta/releases/tag/v0.1.0
