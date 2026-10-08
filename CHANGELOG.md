# Changelog

Tüm önemli değişiklikler bu dosyada belgelenir. Format [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) standardına uygundur ve proje [Semantic Versioning](https://semver.org/spec/v2.0.0.html) kullanır.

## [Unreleased]

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
