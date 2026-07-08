# ZETA - Uçak Tasarım ve Analiz Aracı

[![Release](https://img.shields.io/github/v/release/emirkalfa/zeta?include_prereleases&label=release)](https://github.com/emirkalfa/zeta/releases)
[![CI](https://github.com/emirkalfa/zeta/actions/workflows/ci.yml/badge.svg)](https://github.com/emirkalfa/zeta/actions/workflows/ci.yml)
[![Python](https://img.shields.io/badge/python-3.10%20%7C%203.11%20%7C%203.12-blue)](https://www.python.org/)
[![License: MIT](https://img.shields.io/badge/license-MIT-green)](LICENSE)
[![Tests](https://img.shields.io/badge/tests-124%20passed-brightgreen)](tests/)
[![Release](https://img.shields.io/badge/release-v1.3.3-blue)](https://github.com/emirkalfa/zeta/releases/tag/v1.3.3)

**ZETA**, üniversite seviyesindeki projeler için uçak tasarımı yapmanızı sağlayan bir web uygulamasıdır. Kanat açıklığı, ağırlık ve airfoil profili gibi temel parametreleri girerek bir uçağın tüm geometrik ölçülerini hesaplar, lifting-line teorisi ile aerodinamik analizini yapar, 3 boyutlu modelini oluşturur ve 3D yazıcı için STL dosyaları üretir.

## Özellikler

### Parametre Girişi
- Kanat açıklığı, ağırlık, airfoil profili, kanat konumu (alçak/orta/yüksek), kuyruk tipi (konvansiyonel/T-tail/V-tail), kanat-gövde bileşkesi (içten geçen/yüzeyde biten/ayrı)
- **Otomatik mod**: Tek tıkla hesaplama
- **Manuel mod**: Kök veter, uç veter, ok açısı, dihedral, kuyruk boyutları, gövde boyutları gibi parametreleri elle girme
- CG pozisyonu kaydırıcısı (%MAC)
- Kanat şekli seçimi: **Tapered**, **Rectangular**, **STE Tapered** (Straight Trailing Edge)

### Geometri Hesaplama
Kanat, gövde ve kuyruğa ait ~45 geometrik ölçüyü hesaplar:
- Kanat: açıklık, veter, MAC, açıklık oranı, alan, ok açısı, dihedral, hücum açısı, incelme oranı, kök/konturluk ucu kirişi, flap ve aileron alanları
- Yatay/Dikey kuyruk: açıklık, veter, alan, hacim katsayıları, V-tail açısı
- Gövde: uzunluk, maksimum genişlik/yükseklik, yanal alan, fincan oranı
- Ağırlık merkezi ve nötr nokta pozisyonu
- Kanat yükü, kontrol yüzeyi alanları

### Gövde Tasarımı
- **Konvansiyonel gövde**: Otomatik hesaplanan süperelips kesitli, üstü yassılaştırılmış (wing saddle), altı ventral pod çıkıntılı model
- **Manuel (Özgün) gövde**: 6 adet kesit (K1-K6) ile kullanıcı tanımlı gövde. Her kesit için pozisyon (m), genişlik ve yükseklik slider ile veya sayısal girişle ayarlanabilir
- Kesitler arası smooth Hermite interpolasyonu
- Gövde 3D görüntüleyicide kanat ve kuyrukla birlikte ön izleme

### 3D Model Görüntüleme (Three.js)
- **Ana görüntüleyici**: İnteraktif 3D kanat + gövde + kuyruk
- **Gövde görüntüleyici**: Ayrı bir sahnede gövde kesitleri, kanat ve kuyruk
- Kanat bölgeleri renklendirilmiş: mavi (ana kanat), turuncu (flap), yeşil (kanatçık)
- Kuyruk kontrol yüzeyleri (elevator, rudder) ayrı renklerle
- X/Y/Z eksen butonları, otomatik döndürme, sıfırlama
- Fuselage toggle (gövdeyi göster/gizle)
- Temaya uyumlu arka plan ve grid renkleri
- Fare: sol tuş+sürükle=döndürme, sağ tuş+sürükle=kaydırma, scroll=zoom

### Aerodinamik Analiz (Lifting-line Teorisi)
- Fourier serisi çözümü ile Cl, Cd, Cm polarları
- **Ok açısı (sweep) düzeltmesi**: cl_alpha = cl_alpha_2d * cos(sweep_rad)
- **Post-stall modeli**: CL_max sonrası davranış
- **Reynolds sayısına bağlı**: cd_0, cl_max, cm_0 Re ile ölçeklenir
- 5 adet grafik (Chart.js):
  - Cl vs alpha
  - Cd vs Cl
  - Cm vs alpha
  - Cl/Cd verimlilik
  - Lift dağılımı (kanat açıklığı boyunca)
- Her grafiğin altında sayısal tablo (10 örnek satır)

### Uçabilirlik Testi
7 kriterli değerlendirme:
| Kriter | Formül | Sınırlar |
|--------|--------|----------|
| Stall hızı | sqrt(2W / (rho * S * cl_max)) | <5: çok düşük, <10: normal, <15: biraz yüksek, >=15: FAIL |
| Seyir hızı | sqrt(2W / (rho * S * cl_opt)) | Bilgi amaçlı |
| Tırmanma hızı | (P_avail - P_req) / W | >5: mükemmel, >2: iyi, >0: zayıf, <=0: FAIL |
| Statik margin | NP - CG_percent | 5-20%: stabil, >20%: aşırı stabil, <5%: FAIL |
- Progress bar göstergeli 7 kart
- Değerlendirme listesi
- Uçabilir/Uçamaz kararı

### STL Dışa Aktarma (3D Yazıcı İçin)
- **Tek parça**: Kanat, kuyruk, konvansiyonel gövde, özgün gövde
- **Dilimlenmiş (sliced)**: Her parçayı N eşit parçaya bölerek çıktı
  - Kanat dilimli: sağ/sol ayrı, her dilimde hizalama pimleri ve delikleri
  - Kuyruk dilimli: H-tail sağ/sol + V-tail
  - Gövde dilimli: konvansiyonel ve özgün
- **Et kalınlığı**: 0-5mm ayarlanabilir (0 = yüzey)
- Ölçeklendirme: 1:1000 (mm hassasiyetinde)
- Onay modalı: İndirme öncesi dosya listesi gösterimi
- Güvenlik: blob URL validasyonu

### Airfoil Veritabanı
8 adet NACA 4-hane profili:
- Simetrik: 0012, 0015
- Kamburlu: 2412, 4412, 2415, 4415, 23012, 6412
- Her profil için koordinat verisi ve Re-bağımlı özellikler

### Diğer Özellikler
- **Karanlık/aydınlık mod**: Tema değişimi tüm bileşenlere anında yansır
- **Proje kaydetme**: Cookie + localStorage ile otomatik kaydetme ve geri yükleme
- **Phosphor Icons**: Modern ikon seti
- **XSS koruması**: escapeHtml fonksiyonu ile tüm dinamik içerik güvenli
- **Slider + sayısal giriş**: Her slider'ın yanında hassas değer girişi
- **Yüklenme animasyonu**: Hesaplama sırasında buton yüklenme göstergesi

## Sistem Gereksinimleri

- **Python 3.10+**
- **Modern bir web tarayıcı** (Chrome, Firefox, Edge, Safari)
- **İnternet bağlantısı** (CDN'den kütüphaneler yüklenir)

## Kurulum

```bash
# Bağımlılıkları yükleyin
pip3 install --break-system-packages flask numpy scipy

# Uygulamayı başlatın
python3 app.py

# Tarayıcıda açın: http://localhost:5000
```

## API Uç Noktaları

| Route | Metot | Açıklama |
|-------|-------|----------|
| `/` | GET | Ana sayfa |
| `/api/airfoils` | GET | Airfoil listesi |
| `/api/airfoil/<id>` | GET | Airfoil detayı + koordinatlar |
| `/api/airfoil_props/<code>` | GET | Airfoil özellikleri (opsiyonel Re parametresi ile) |
| `/api/calculate` | POST | Geometri hesaplama |
| `/api/analyze` | POST | Aerodinamik analiz |
| `/api/stability` | POST | Uçabilirlik testi |
| `/api/version` | GET | Sürüm bilgisi |
| `/healthz` | GET | Sağlık kontrolü |

## Testler

```bash
pip3 install pytest
pytest
```

124 test (pytest):
- `test_app.py`: Flask endpoint testleri
- `test_airfoil.py`: Airfoil hesaplama, alpha_L0, cm_0, cl_max/cd_0 referans karşılaştırmaları
- `test_geometry.py`: Geometri hesaplamaları
- `test_analysis.py`: Lifting-line çözümü, 3D CL_alpha eğimi
- `test_stability.py`: Downwash AR-bağımlılığı, htail alan etkisi

CI/CD: GitHub Actions ile push/PR'da otomatik test.

## Dosya Yapısı

```
zeta/
├── app.py                    # Ana Flask sunucu
├── requirements.txt          # Python bağımlılıkları
├── README.md
├── VERSION                   # Sürüm numarası (tek kaynak)
├── CHANGELOG.md
├── RELEASING.md
├── pyproject.toml
├── database/
│   ├── schema.sql
│   ├── seed.py
│   └── zeta.db
├── backend/
│   ├── __init__.py
│   ├── airfoil.py            # NACA airfoil hesaplama
│   ├── geometry.py           # Geometri hesaplamaları
│   ├── analysis.py           # Aerodinamik analiz
│   └── stability.py          # Uçabilirlik testi
├── static/
│   ├── css/style.css         # Stil dosyası (dark/light mode)
│   ├── favicon.svg
│   └── js/
│       ├── app.js            # Ana uygulama mantığı
│       ├── viewer3d.js       # Three.js 3D görüntüleyici (kanat+gövde+kuyruk)
│       ├── charts.js         # Chart.js grafikleri
│       └── stlexport.js      # STL dışa aktarma
├── templates/
│   └── index.html            # Ana sayfa
├── tests/
│   ├── conftest.py
│   ├── test_app.py
│   ├── test_airfoil.py
│   ├── test_geometry.py
│   ├── test_analysis.py
│   └── test_stability.py
└── .github/workflows/
    ├── ci.yml
    └── release.yml
```

## Teknik Detaylar

| Modül | Yöntem |
|-------|--------|
| Geometri | Klasik uçak geometrisi formülleri + STE modeli |
| Aerodinamik | Lifting-line teorisi (Fourier serisi) + sweep düzeltmesi + post-stall |
| Stabilite | Nötr nokta, static margin, downwash (AR-bağımlı) |
| Airfoil | Thin airfoil teorisi, alpha_L0 numerik integral, Re-bağımlı |
| 3D Model | Three.js BufferGeometry + OrbitControls |
| Grafikler | Chart.js (scatter + line) |
| STL | Three.js STLBinaryExporter, manifold mesh |
| Veritabanı | SQLite |
| Frontend | Vanilla JS, CSS custom properties, Phosphor Icons |

## Sürüm

Mevcut sürüm: **v1.3.3**. Detaylı değişiklik günlüğü için [CHANGELOG.md](CHANGELOG.md)'ye bakın.
