# ZETA - Uçak Tasarım ve Analiz Aracı

[![Release](https://img.shields.io/github/v/release/emirkalfa/zeta?include_prereleases&label=release)](https://github.com/emirkalfa/zeta/releases)
[![CI](https://github.com/emirkalfa/zeta/actions/workflows/ci.yml/badge.svg)](https://github.com/emirkalfa/zeta/actions/workflows/ci.yml)
[![Python](https://img.shields.io/badge/python-3.10%20%7C%203.11%20%7C%203.12-blue)](https://www.python.org/)
[![License: MIT](https://img.shields.io/badge/license-MIT-green)](LICENSE)
[![Tests](https://img.shields.io/badge/tests-124%20passed-brightgreen)](tests/)
[![Release](https://img.shields.io/badge/release-v1.3.3-blue)](https://github.com/emirkalfa/zeta/releases/tag/v1.3.3)

**ZETA**, üniversite seviyesindeki projeler için uçak tasarımı yapmanızı sağlayan bir web uygulamasıdır. Kanat açıklığı, ağırlık ve airfoil profili gibi temel parametreleri girerek bir uçağın tüm geometrik ölçülerini hesaplar, lifting-line teorisi ile aerodinamik analizini yapar, 3 boyutlu modelini oluşturur ve 3D yazıcı için STL dosyaları üretir.

## Ozellikler

### Parametre Girisi
- Kanat acikligi, agirlik, airfoil profili, kanat konumu (alcak/orta/yuksek), kuyruk tipi (konvansiyonel/T-tail/V-tail), kanat-govde bileskesi (icten gecen/yuzeyde biten/ayri)
- **Otomatik mod**: Tek tukla hesaplama
- **Manuel mod**: Kok veter, uç veter, ok acisi, dihedral, kuyruk boyutlari, govde boyutlari gibi parametreleri elle girme
- CG pozisyonu kaydirici (%MAC)
- Kanat sekli secimi: **Tapered**, **Rectangular**, **STE Tapered** (Straight Trailing Edge)

### Geometri Hesaplama
Kanat, govde ve kuyruga ait ~45 geometrik olcuyu hesaplar:
- Kanat: aciklik, veter, MAC, aciklik orani, alan, ok acisi, dihedral, hucre acisi, incelme orani, kok/konturluk ucu kiriş, flap ve aileron alanlari
- Yatay/Dikey kuyruk: aciklik, veter, alan, hacim katsayilari, V-tail acisi
- Govde: uzunluk, maksimum genislik/yukseklik, yanal alan, fincan orani
- Agirlik merkezi ve nötr nokta pozisyonu
- Kanat yuku, kontrol yuzeyi alanlari

### Govde Tasarimi
- **Konvansiyonel govde**: Otomatik hesaplanan superellips kesitli, usti yassilastirilmis (wing saddle), alti ventral pod cikintili model
- **Manuel (Ozg�n) govde**: 6 adet kesit (K1-K6) ile kullanici tanimli govde. Her kesit icin pozisyon (m), genislik ve yukseklik slider ile veya sayisal girisle ayarlanabilir
- Kesitler arasi smooth Hermite interpolasyonu
- Govde 3D goruntuleyicide kanat ve kuyrukla birlikte on izleme

### 3D Model Goruntuleme (Three.js)
- **Ana goruntuleyici**: Interaktif 3D kanat + govde + kuyruk
- **Govde goruntuleyici**: Ayri bir sahnede govde kesitleri, kanat ve kuyruk
- Kanat bolgeleri renklendirilmis: mavi (ana kanat), turuncu (flap), yesil (kanatcik)
- Kuyruk kontrol yuzeyleri (elevator, rudder) ayri renklerle
- X/Y/Z eksen butonlari, otomatik dondurme, sifirlama
- Fuselage toggle (govdeyi goster/gizle)
- Temaya uyumlu arka plan ve grid renkleri
- Fare: sol tus+surukle=dondurme, sag tus+surukle=kaydirma, scroll=zoom

### Aerodinamik Analiz (Lifting-Line Teorisi)
- Fourier serisi cozumu ile Cl, Cd, Cm polarlari
- **Ok acisi (sweep) duzeltmesi**: cl_alpha = cl_alpha_2d * cos(sweep_rad)
- **Post-stall modeli**: CL_max sonrasi davranis
- **Reynolds sayisina bagli**: cd_0, cl_max, cm_0 Re ile olceklenir
- 5 adet grafik (Chart.js):
  - Cl vs alpha
  - Cd vs Cl
  - Cm vs alpha
  - Cl/Cd verimlilik
  - Lift dagilimi (kanat acikligi boyunca)
- Her grafigin altinda sayisal tablo (10 ornek satir)

### Ucabilirlik Testi
7 kriterli degerlendirme:
| Kriter | Formul | Sinirlar |
|--------|--------|----------|
| Stall hizi | sqrt(2W / (rho * S * cl_max)) | <5: cok dusuk, <10: normal, <15: biraz yuksek, >=15: FAIL |
| Seyir hizi | sqrt(2W / (rho * S * cl_opt)) | Bilgi amacli |
| Tirmanma hizi | (P_avail - P_req) / W | >5: mukemmel, >2: iyi, >0: zayif, <=0: FAIL |
| Statik margin | NP - CG_percent | 5-20%: stabil, >20%: asiri stabil, <5%: FAIL |
- Progress bar gostergeli 7 kart
- Degerlendirme listesi
- Ucabilir/Ucamaz karari

### STL Disa Aktarma (3D Yazici Icin)
- **Tek parca**: Kanat, kuyruk, konvansiyonel govde, ozgun govde
- **Dilimlenmis (sliced)**: Her parcayi N esit parcaya bolerek cikti
  - Kanat dilimli: sag/sol ayri, her dilimde hizalama pimleri ve delikleri
  - Kuyruk dilimli: H-tail sag/sol + V-tail
  - Govde dilimli: konvansiyonel ve ozgun
- **Et kalinligi**: 0-5mm ayarlanabilir (0 = yuzey)
- Olceklendirme: 1:1000 (mm hassasiyetinde)
- Onay modali: Indirme oncesi dosya listesi gosterimi
- Guvenlik: blob URL validasyonu

### Airfoil Veritabani
8 adet NACA 4-hane profili:
- Simetrik: 0012, 0015
- Kamburlu: 2412, 4412, 2415, 4415, 23012, 6412
- Her profil icin koordinat verisi ve Re-bagimli ozellikler

### Diger Ozellikler
- **Karanlik/aydinlik mod**: Tema degisimi tum bilesenlere aninda yansir
- **Proje kaydetme**: Cookie + localStorage ile otomatik kaydetme ve geri yukleme
- **Phosphor Icons**: Modern ikon seti
- **XSS korumasi**: escapeHtml fonksiyonu ile tum dinamik icerik guvenli
- **Slider + sayisal giris**: Her slider'in yaninda hassas deger girisi
- **Yuklenme animasyonu**: Hesaplama sirasinda buton yuklenme gostergesi

## Sistem Gereksinimleri

- **Python 3.10+**
- **Modern bir web tarayici** (Chrome, Firefox, Edge, Safari)
- **Internet baglantisi** (CDN'den kutuphaneler yuklenir)

## Kurulum

```bash
# Bagimliliklari yukleyin
pip3 install --break-system-packages flask numpy scipy

# Uygulamayi baslatin
python3 app.py

# Tarayicida acin: http://localhost:5000
```

## API Uç Noktalari

| Route | Metod | Aciklama |
|-------|-------|----------|
| `/` | GET | Ana sayfa |
| `/api/airfoils` | GET | Airfoil listesi |
| `/api/airfoil/<id>` | GET | Airfoil detayi + koordinatlar |
| `/api/airfoil_props/<code>` | GET | Airfoil ozellikleri (opsiyonel Re parametresi ile) |
| `/api/calculate` | POST | Geometri hesaplama |
| `/api/analyze` | POST | Aerodinamik analiz |
| `/api/stability` | POST | Ucabilirlik testi |
| `/api/version` | GET | Surum bilgisi |
| `/healthz` | GET | Saglik kontrolu |

## Testler

```bash
pip3 install pytest
pytest
```

124 test (pytest):
- `test_app.py`: Flask endpoint testleri
- `test_airfoil.py`: Airfoil hesaplama, alpha_L0, cm_0, cl_max/cd_0 referans karsilastirmalari
- `test_geometry.py`: Geometri hesaplamalari
- `test_analysis.py`: Lifting-line cozumu, 3D CL_alpha egimi
- `test_stability.py`: Downwash AR-bagimliligi, htail alan etkisi

CI/CD: GitHub Actions ile push/PR'da otomatik test.

## Dosya Yapisi

```
zeta/
├── app.py                    # Ana Flask sunucu
├── requirements.txt          # Python bagimliliklari
├── README.md
├── VERSION                   # Surum numarasi (tek kaynak)
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
│   ├── geometry.py           # Geometi hesaplamalari
│   ├── analysis.py           # Aerodinamik analiz
│   └── stability.py          # Ucabilirlik testi
├── static/
│   ├── css/style.css         # Stil dosyasi (dark/light mode)
│   ├── favicon.svg
│   └── js/
│       ├── app.js            # Ana uygulama mantigi
│       ├── viewer3d.js       # Three.js 3D goruntuleyici (kanat+govde+kuyruk)
│       ├── charts.js         # Chart.js grafikleri
│       └── stlexport.js      # STL disa aktarma
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

| Modul | Yontem |
|-------|--------|
| Geometri | Klasik ucak geometrisi formulleri + STE modeli |
| Aerodinamik | Lifting-line teorisi (Fourier serisi) + sweep duzeltmesi + post-stall |
| Stabilite | Notr nokta, static margin, downwash (AR-bagimli) |
| Airfoil | Thin airfoil teorisi, alpha_L0 numerik integral, Re-bagimli |
| 3D Model | Three.js BufferGeometry + OrbitControls |
| Grafikler | Chart.js (scatter + line) |
| STL | Three.js STLBinaryExporter, manifold mesh |
| Veritabani | SQLite |
| Frontend | Vanilla JS, CSS custom properties, Phosphor Icons |

## Surum

Mevcut surum: **v1.3.3**. Detayli degisiklik gunlugu icin [CHANGELOG.md](CHANGELOG.md)'ye bakin.
