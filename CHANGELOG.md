# Changelog

Tüm önemli değişiklikler bu dosyada belgelenir. Format [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) standardına uygundur ve proje [Semantic Versioning](https://semver.org/spec/v2.0.0.html) kullanır.

## [Unreleased]

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

[Unreleased]: https://github.com/emirkalfa/zeta/compare/v2.0.0...HEAD
[2.0.0]: https://github.com/emirkalfa/zeta/compare/v1.3.3...v2.0.0
[1.2.3]: https://github.com/emirkalfa/zeta/compare/v1.2.2...v1.2.3
[1.2.2]: https://github.com/emirkalfa/zeta/compare/v1.0.2...v1.2.2
[1.0.2]: https://github.com/emirkalfa/zeta/compare/v1.0.0...v1.0.2
[1.0.0]: https://github.com/emirkalfa/zeta/compare/v0.2.0...v1.0.0
[0.2.0]: https://github.com/emirkalfa/zeta/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/emirkalfa/zeta/releases/tag/v0.1.0
