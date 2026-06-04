# ✈️ ZETA - Uçak Tasarım ve Analiz Aracı

[![Release](https://img.shields.io/github/v/release/emirkalfa/zeta?include_prereleases&label=release)](https://github.com/emirkalfa/zeta/releases)
[![CI](https://github.com/emirkalfa/zeta/actions/workflows/ci.yml/badge.svg)](https://github.com/emirkalfa/zeta/actions/workflows/ci.yml)
[![Python](https://img.shields.io/badge/python-3.10%20%7C%203.11%20%7C%203.12-blue)](https://www.python.org/)
[![License: MIT](https://img.shields.io/badge/license-MIT-green)](LICENSE)
[![Tests](https://img.shields.io/badge/tests-124%20passed-brightgreen)](tests/)
[![Release](https://img.shields.io/badge/release-v1.0.0-blue)](https://github.com/emirkalfa/zeta/releases/tag/v1.0.0)

**ZETA**, üniversite seviyesindeki projeler için **uçak tasarımı** yapmanızı sağlayan bir web uygulamasıdır. Kanat açıklığı, ağırlık ve airfoil profili gibi temel parametreleri girerek bir uçağın tüm geometrik ölçülerini hesaplar, aerodinamik analizini yapar ve 3 boyutlu modelini oluşturur.

## 🚀 Özellikler

- **Geometri Hesaplama**: Kanat, gövde ve kuyruk ölçüleri (veter, MAC, açıklık oranı, alan, ok açısı, dihedral)
- **3D Model Görüntüleme**: Three.js ile interaktif 3D model (döndürme, zoom, eksen seçimi)
- **Aerodinamik Analiz**: Lifting-line teorisi ile Cl, Cd, Cm hesaplamaları ve grafikler
- **Uçabilirlik Testi**: Stall hızı, seyir hızı, tırmanma oranı, statik stabilite
- **STL İndirme**: 3D yazıcıda basmak için ayrı ayrı STL dosyaları (kanat, gövde, kuyruk) — doğru dihedral ve mm hassasiyetinde
- **8 NACA Profili**: 0012, 2412, 4412, 2415, 0015, 4415, 23012, 6412
- **Karanlık Mod**: Göz yormayan koyu tema
- **Proje Kaydetme**: localStorage ile otomatik kaydetme

## 📋 Sistem Gereksinimleri

- **Python 3.10+**
- **Modern bir web tarayıcı** (Chrome, Firefox, Edge, Safari)
- **İnternet bağlantısı** (CDN'den kütüphaneler yüklenir)

## 🛠️ Kurulum

### 1. Python ve pip kontrolü

```bash
python3 --version
pip3 --version
```

### 2. Bağımlılıkları yükleyin

```bash
pip3 install --break-system-packages flask numpy scipy
```

> Eğer `--break-system-packages` çalışmazsa, `pip3 install flask numpy scipy` deneyin veya sanal ortam (virtualenv) kullanın.

### 3. Uygulamayı çalıştırın

```bash
python3 app.py
```

### 4. Tarayıcıda açın

Adres çubuğuna yazın: **http://localhost:5000**

## 📖 Kullanım Kılavuzu

### 1. Parametreleri Girin

| Alan | Açıklama |
|------|----------|
| **Kanat Açıklığı** | Kanat ucundan ucuna mesafe (metre) |
| **Ağırlık** | Uçağın toplam ağırlığı (kg) |
| **Airfoil Profili** | Kanat kesit profili (8 seçenek) |
| **Kanat Konumu** | Alçak / Orta / Yüksek kanat |
| **Kuyruk Tipi** | Konvansiyonel / T-tail / V-tail |
| **Kanat-Gövde** | İçten geçen / Yüzeyde biten / Ayrı |

### 2. HESAPLA butonuna tıklayın

Uygulama otomatik olarak:
- Tüm geometrik ölçüleri hesaplar
- 3D modeli oluşturur
- Aerodinamik analizi yapar
- Uçabilirlik testini çalıştırır

### 3. 3D Modeli İnceleyin

- **Sol tık + sürükle**: Modeli döndürme
- **Sağ tık + sürükle**: Kaydırma
- **Scroll**: Yakınlaştırma/uzaklaştırma
- **X/Y/Z butonları**: Eksenlerden görüntüleme
- **⟳ butonu**: Otomatik döndürme

### 4. Sonuçları Görüntüleyin

- **Geometrik Ölçüler**: Tüm boyutlar kartlar halinde
- **Analiz Grafikleri**: Cl/Cd/Cm grafikleri + sayısal tablolar
- **Uçabilirlik Testi**: ✅ UÇABİLİR / ❌ UÇAMAZ kararı

### 5. STL Dosyalarını İndirin

"Kanat STL", "Gövde STL" veya "Kuyruk STL" butonlarına tıklayarak 3D yazıcıda basmak için dosyaları indirebilirsiniz.

## 📁 Dosya Yapısı

```
zeta/
├── app.py                    # Ana Flask sunucu
├── requirements.txt          # Python bağımlılıkları
├── README.md                 # Bu dosya
├── database/
│   ├── schema.sql            # SQLite veritabanı şeması
│   ├── seed.py               # Airfoil verileri
│   └── zeta.db               # Veritabanı (otomatik oluşur)
├── backend/
│   ├── airfoil.py            # NACA airfoil hesaplama
│   ├── geometry.py           # Geometri hesaplamaları
│   ├── analysis.py           # Aerodinamik analiz
│   └── stability.py          # Uçabilirlik testi
├── static/
│   ├── css/style.css         # Stil dosyası (dark mode)
│   └── js/
│       ├── app.js            # Ana uygulama mantığı
│       ├── viewer3d.js       # Three.js 3D görüntüleyici
│       ├── charts.js         # Grafik çizimleri
│       └── stlexport.js      # STL dışa aktarma
└── templates/
    └── index.html            # Ana sayfa
```

## 🔧 Teknik Detaylar

### Hesaplama Yöntemleri

| Modül | Yöntem |
|-------|--------|
| Geometri | Klasik uçak geometrisi formülleri |
| Aerodinamik | Lifting-line teorisi (Fourier serisi) |
| Stabilite | Nötr nokta, static margin hesabı |
| 3D Model | Three.js BufferGeometry + OrbitControls |

### Kullanılan Teknolojiler

| Bileşen | Teknoloji |
|---------|-----------|
| Backend | Python + Flask |
| Veritabanı | SQLite |
| 3D Motor | Three.js (CDN) |
| Grafikler | Chart.js (CDN) |
| STL Çıktı | Three.js STLBinaryExporter |

## ❓ Sık Sorulan Sorular

**S: Hata alıyorum, ne yapmalıyım?**
C: Önce tüm bağımlılıkların yüklü olduğundan emin olun. Çıktıdaki hata mesajını okuyun ve gerekli kütüphaneleri yükleyin.

**S: STL dosyasını nasıl kullanacağım?**
C: İndirdiğiniz STL dosyasını herhangi bir 3D dilimleme yazılımına (Cura, PrusaSlicer, vs.) yükleyip baskıya hazırlayabilirsiniz.

**S: Neden XFLR5 kadar hassas değil?**
C: ZETA, eğitim amaçlı basitleştirilmiş modeller kullanır. XFLR5 panel metotları ile çalışırken, ZETA lifting-line teorisi kullanır. Yine de üniversite projeleri için yeterli doğrulukta sonuçlar verir.

**S: Kendi airfoil'imi ekleyebilir miyim?**
C: Şimdilik sadece 8 NACA profili mevcut. Gelecek sürümlerde kullanıcı tanımlı profil desteği eklenecektir.

## 📄 Lisans

Bu proje eğitim amaçlıdır. MIT lisansı ile lisanslanmıştır.

## 🔄 Sürüm

Mevcut sürüm: `VERSION` dosyasından okunur. Sürüm numarası `pyproject.toml`,
`app.py` ve `CHANGELOG.md` tarafından otomatik kullanılır. Yeni sürüm
yayınlama adımları için [`RELEASING.md`](RELEASING.md) belgesine bakın.
