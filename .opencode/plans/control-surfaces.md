# Kanat Kontrol Yüzeyleri (Aileron + Flap)

## Amaç
Kanat üzerinde aileron (kanatçık) ve flap kontrol yüzeylerini hesaplama, 3D görselleştirme ve STL çıktısı olarak eklemek. Tüm wing_shape'lerde (tapered, rectangular, ste_tapered) çalışacak.

---

## 1. Mevcut Durum

- **Kuyruk**: `buildTail` içinde `hElevChord = hChord * 0.3` tanımlı ama elevator görsel olarak ayrılmamış
- **Kanat**: Hiç kontrol yüzeyi yok
- **Tüm hesaplamalar**: Klasik uçak geometrisi formülleri kullanılıyor

---

## 2. Kontrol Yüzeyi Parametreleri

### Aileron (Kanatçık)
| Parametre | Değer | Açıklama |
|-----------|-------|----------|
| Span başlangıç | %55 half-span | Köke yakın iç sınır |
| Span bitiş | %90 half-span | Uca yakın dış sınır |
| Veter oranı | %25 local chord | Trailing edge'den itibaren |
| Renk | `0x22c55e` (yeşil) | 3D görselde ayırt edilebilir |

### Flap
| Parametre | Değer | Açıklama |
|-----------|-------|----------|
| Span başlangıç | %8 half-span | Gövdeye yakın |
| Span bitiş | %50 half-span | Orta kısım |
| Veter oranı | %30 local chord | Trailing edge'den itibaren |
| Renk | `0xf97316` (turuncu) | 3D görselde ayırt edilebilir |

### Elevator & Rudder (Kuyruk)
| Parametre | Değer | Açıklama |
|-----------|-------|----------|
| Elevator veter | %30 local chord | Zaten tanımlı, görselleştirilecek |
| Rudder veter | %30 local chord | Dikey kuyruk için |
| Elevator rengi | `0x22c55e` | |
| Rudder rengi | `0xf97316` | |

---

## 3. Dosya Değişiklikleri

### 3a. `backend/geometry.py` — Yeni fonksiyon: `calculate_control_surfaces(geom)`

```python
def calculate_control_surfaces(geom):
    """Return aileron and flap geometry based on wing parameters.
    
    All wing shapes (tapered, rectangular, ste_tapered) use the same
    spanwise percentages; chord varies with local wing chord.
    """
    # Aileron
    ail_eta_start = 0.55           # span fraction start
    ail_eta_end = 0.90             # span fraction end
    ail_chord_ratio = 0.25         # percent of local chord
    
    # Flap  
    flap_eta_start = 0.08          # span fraction start  
    flap_eta_end = 0.50            # span fraction end
    flap_chord_ratio = 0.30        # percent of local chord
    
    def cs_area(eta_s, eta_e, chord_ratio, taper, root_chord, half_span):
        """Integrate control surface area along span."""
        n = 20
        area = 0.0
        for i in range(n):
            eta1 = eta_s + (eta_e - eta_s) * i / n
            eta2 = eta_s + (eta_e - eta_s) * (i + 1) / n
            c1 = root_chord * (1 - eta1 * (1 - taper))
            c2 = root_chord * (1 - eta2 * (1 - taper))
            dy = half_span * (eta2 - eta1)
            cs_c1 = c1 * chord_ratio
            cs_c2 = c2 * chord_ratio
            area += (cs_c1 + cs_c2) / 2 * dy * 2  # both wings
        return area
    
    half_span = geom['wingspan'] / 2
    taper = geom['taper_ratio_input']
    root_chord = geom['root_chord']  # note: this is rounded
    # Use unrounded for area calc
    root_chord_raw = root_chord  # will use anyway
    
    aileron = {
        'eta_start': ail_eta_start,
        'eta_end': ail_eta_end,
        'chord_ratio': ail_chord_ratio,
        'span_start_m': round(ail_eta_start * half_span, 3),
        'span_end_m': round(ail_eta_end * half_span, 3),
        'area': round(cs_area(ail_eta_start, ail_eta_end, ail_chord_ratio, taper, root_chord, half_span), 4),
        'chord_at_root': round(root_chord * (1 - ail_eta_start * (1 - taper)) * ail_chord_ratio, 3),
        'chord_at_tip': round(root_chord * (1 - ail_eta_end * (1 - taper)) * ail_chord_ratio, 3),
    }
    
    flap = {
        'eta_start': flap_eta_start,
        'eta_end': flap_eta_end,
        'chord_ratio': flap_chord_ratio,
        'span_start_m': round(flap_eta_start * half_span, 3),
        'span_end_m': round(flap_eta_end * half_span, 3),
        'area': round(cs_area(flap_eta_start, flap_eta_end, flap_chord_ratio, taper, root_chord, half_span), 4),
        'chord_at_root': round(root_chord * (1 - flap_eta_start * (1 - taper)) * flap_chord_ratio, 3),
        'chord_at_tip': round(root_chord * (1 - flap_eta_end * (1 - taper)) * flap_chord_ratio, 3),
    }
    
    elevator = {
        'chord_ratio': 0.30,
        'area': round(geom['htail_area'] * 0.30, 4),
    }
    
    rudder = {
        'chord_ratio': 0.30,
        'area': round(geom['vtail_area'] * 0.30, 4),
    }
    
    return {
        'aileron': aileron,
        'flap': flap,
        'elevator': elevator,
        'rudder': rudder,
    }
```

**`calculate_geometry` sonucuna ekle**: `control_surfaces` anahtarı olarak.

### 3b. `static/js/viewer3d.js` — Kontrol yüzeylerini görselleştir

**`buildWing` fonksiyonunu değiştir:**
- `makeHalf`'ı 3 ayrı mesh döndürecek şekilde değiştir: `{flap, aileron, main}`
- Her biri için ayrı `BufferGeometry` + `Mesh` oluştur
- Renkler: main=`0x3b82f6`, flap=`0xf97316`, aileron=`0x22c55e`
- Kontrol yüzeyleri arasında ince bir çizgi (edge) oluştur

**`buildTail` fonksiyonunu değiştir:**
- Elevator'ı (%30 arka kısım) ayrı mesh yap (renk: `0x22c55e`)
- Rudder'ı (%30 arka kısım) ayrı mesh yap (renk: `0xf97316`)
- Geri kalan stab kısmı mevcut renkte

**Mimari:**
- Mevcut `buildWing` tek mesh döndürür → yeni: `{mainMesh, flapMesh, aileronMesh}` döndür
- `buildWingSegment` (STL için) de kontrol yüzeylerini ayrı segmentler olarak döndürebilir

**Detay: Control surface mesh oluşturma patternsi:**

Her bir wing half için, spanwise section'larda trailing edge'in `chord_ratio` kadarını al:
```javascript
function extractControlSurface(secs, chordRatio) {
  // Her section'ın TE kısmını (foil_x > 1-chordRatio) ayır
  const csSecs = secs.map(sec => {
    const nPts = sec.length;
    const nHalf = nPts / 2;
    const cutX = 1 - chordRatio;  // foil_x cut point
    // Find indices where foil_x > cutX
    const tePts = sec.filter(p => p.x >= cutX * chord + xOff);
    return tePts; // envelope of TE portion
  });
  return csSecs;
}
```

Daha temiz yaklaşım: section-based filtreleme.
Her section için, foil_x değerine göre trailing edge kısmını seç:
- `upperPoints` içinde `foil_x > 1 - chord_ratio` olan noktalar
- `lowerPoints` içinde `foil_x > 1 - chord_ratio` olan noktalar (foil_x[lower_idx])
- Bu noktaları section'lar arasında triangüle et

### 3c. `templates/index.html` — UI'da kontrol yüzeyi bilgisi

"Geometrik Ölçüler" kartına kontrol yüzeyi alanlarını ekle:
- Aileron alanı, flap alanı, elevator alanı, rudder alanı

İsteğe bağlı: parametre ayarları
- Aileron chord ratio slider (%15-%35)
- Flap chord ratio slider (%20-%40)
- Aileron span slider (inner/outer limits)
- Flap span slider (inner/outer limits)

### 3d. `static/js/app.js` — Kontrol yüzeyi verilerini göster

`displayResults` fonksiyonuna ekle:
```javascript
if (geom.control_surfaces) {
  const cs = geom.control_surfaces;
  // Aileron bilgisi
  // Flap bilgisi
}
```

### 3e. `static/js/stlexport.js` — STL'de kontrol yüzeyleri

- `exportSTL('wing')`: Ana kanat + flap + aileron ayrı STL'ler
- Veya tek STL'de entegre

### 3f. `tests/test_geometry.py` — Testler

```python
class TestControlSurfaces:
    def test_aileron_eta_range(self):
        g = calculate_geometry(1.5, 2.5, "2412")
        cs = calculate_control_surfaces(g)
        assert 0 < cs['aileron']['eta_start'] < cs['aileron']['eta_end'] < 1.0

    def test_flap_eta_range(self):
        g = calculate_geometry(1.5, 2.5, "2412")
        cs = calculate_control_surfaces(g)
        assert cs['flap']['eta_start'] < cs['flap']['eta_end']

    def test_aileron_flap_no_overlap(self):
        g = calculate_geometry(1.5, 2.5, "2412")
        cs = calculate_control_surfaces(g)
        assert cs['aileron']['eta_start'] >= cs['flap']['eta_end']

    def test_cs_area_positive(self):
        g = calculate_geometry(1.5, 2.5, "2412")
        cs = calculate_control_surfaces(g)
        assert cs['aileron']['area'] > 0
        assert cs['flap']['area'] > 0
        assert cs['elevator']['area'] > 0
        assert cs['rudder']['area'] > 0

    def test_cs_keys_present(self, default_geom):
        assert 'control_surfaces' in default_geom
```

---

## 4. Uygulama Sırası

1. `backend/geometry.py`: `calculate_control_surfaces` fonksiyonu + geometry result'a ekle
2. `tests/test_geometry.py`: Testleri yaz + çalıştır
3. `static/js/viewer3d.js`: `buildWing`'i 3 parçalı (main/flap/aileron) yap + tail'de elevator/rudder ayrımı
4. `static/js/app.js`: `displayResults`'a CS bilgisi ekle
5. `templates/index.html`: CS bilgisi için kartlar + isteğe bağlı slider'lar
6. `static/js/stlexport.js`: CS ayrı STL veya entegre
7. Final test: `pytest` + manuel test
