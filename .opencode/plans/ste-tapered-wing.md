# STE (Straight Trailing Edge) Daralan Kanat Özelliği

## Amaç
"Düz Firar Kenarlı Daralan Kanat" (Straight Trailing Edge Tapered Wing) eklenmesi. Firar kenarı gövdeye dik (sabit X pozisyonu), sadece hücum kenarı süpürülür.

---

## 1. `backend/geometry.py`

### 1a. `calculate_geometry` — STE hesaplama modu

Şu blok (satır 21-33):
```python
    else:
        ar = 7.0
        sweep_angle = 5.0
        dihedral_angle = 3.0
        if wing_shape == 'rectangular':
            taper_ratio = 1.0
            sweep_angle = 0.0
        else:
            taper_ratio = 0.5
        wing_area = wingspan**2 / ar
        root_chord = 2 * wing_area / (wingspan * (1 + taper_ratio))
        tip_chord = root_chord * taper_ratio
        aspect_ratio = ar
```

Şununla değiştirilmeli:
```python
    else:
        ar = 7.0
        dihedral_angle = 3.0
        if wing_shape == 'rectangular':
            taper_ratio = 1.0
            sweep_angle = 0.0
        elif wing_shape == 'ste_tapered':
            taper_ratio = 0.5
            sweep_angle = 5.0
        else:
            taper_ratio = 0.5
            sweep_angle = 5.0
        wing_area = wingspan**2 / ar
        root_chord = 2 * wing_area / (wingspan * (1 + taper_ratio))
        tip_chord = root_chord * taper_ratio
        aspect_ratio = ar
        if wing_shape == 'ste_tapered':
            half_span = wingspan / 2
            sweep_angle = float(np.degrees(np.arctan(0.75 * root_chord * (1 - taper_ratio) / max(half_span, 0.01))))
```

### 1b. `calculate_geometry` — result dict'e `straight_te` flag'i ekle

`taper_ratio_input` satırından sonra (yaklaşık satır 133), `result` dict'ine ekle:
```python
        'straight_te': wing_shape == 'ste_tapered' or wing_shape == 'ste_tapered',
```
Aslında şöyle:
```python
        'straight_te': wing_shape == 'ste_tapered',
```

### 1c. `generate_wing_mesh_data` — STE x_offset

Şu satır (145-146):
```python
    sweep = np.radians(geom['sweep_angle'])
    dihedral = np.radians(geom['dihedral_angle'])
```

Sonra, `for i in range(n_sections + 1):` döngüsü içindeki:
```python
        chord = root_chord * (1 - eta * (1 - taper))
        x_offset = y_pos * np.tan(sweep)
```
Şöyle değiştirilmeli:
```python
        chord = root_chord * (1 - eta * (1 - taper))
        if geom.get('straight_te', False):
            x_offset = root_chord - chord
        else:
            x_offset = y_pos * np.tan(sweep)
```

---

## 2. `templates/index.html`

Satır 59-62:
```html
          <div class="radio-group">
            <label class="radio-label"><input type="radio" name="wing_shape" value="tapered" checked> ◢ Konik</label>
            <label class="radio-label"><input type="radio" name="wing_shape" value="rectangular"> ▬ Dikdörtgen</label>
          </div>
```

Şöyle değiştirilmeli:
```html
          <div class="radio-group">
            <label class="radio-label"><input type="radio" name="wing_shape" value="tapered" checked> ◢ Konik</label>
            <label class="radio-label"><input type="radio" name="wing_shape" value="rectangular"> ▬ Dikdörtgen</label>
            <label class="radio-label"><input type="radio" name="wing_shape" value="ste_tapered"> ◥ Düz Firar Kenarlı</label>
          </div>
```

---

## 3. `static/js/viewer3d.js`

### 3a. `buildWing` — STE x_offset

Satır 119:
```javascript
      const xOff = yPos * Math.tan(sweep) + wingX;
```

Şöyle değiştirilmeli:
```javascript
      const xOff = geom.straight_te ? (rootChord - chord + wingX) : (yPos * Math.tan(sweep) + wingX);
```

### 3b. `buildWingSegment` — STE x_offset

Satır 779:
```javascript
    const xOff = yPos * Math.tan(sweep) + wingX;
```

Şöyle değiştirilmeli:
```javascript
    const xOff = geom.straight_te ? (rootChord - chord + wingX) : (yPos * Math.tan(sweep) + wingX);
```

---

## 4. `static/js/app.js`

Değişiklik gerekmez. `wing_shape` zaten dinamik olarak formdan okunup backend'e gönderiliyor. `saveProject` / `loadProject` / `checkSavedProject` zaten `wing_shape` değerini kaydedip geri yüklüyor.

---

## 5. `static/js/stlexport.js`

Değişiklik gerekmez. `exportSlicedWing` ve `exportSTL('wing')` direkt `buildWingSegment`'i çağırır; viewer3d.js'deki değişiklik otomatik olarak etki eder.

---

## 6. `tests/test_geometry.py`

### Test sınıfı ekle:

```python
class TestStraightTrailingEdge:
    def test_ste_taper_ratio(self):
        g = calculate_geometry(1.5, 2.5, "2412", wing_shape="ste_tapered")
        assert g["taper_ratio"] == pytest.approx(0.5)

    def test_ste_straight_te_flag(self):
        g = calculate_geometry(1.5, 2.5, "2412", wing_shape="ste_tapered")
        assert g["straight_te"] is True

        g2 = calculate_geometry(1.5, 2.5, "2412", wing_shape="tapered")
        assert g2["straight_te"] is False

    def test_ste_sweep_angle_positive(self):
        g = calculate_geometry(1.5, 2.5, "2412", wing_shape="ste_tapered")
        assert g["sweep_angle"] > 0

    def test_ste_mesh_straight_te(self):
        g = calculate_geometry(1.5, 2.5, "2412", wing_shape="ste_tapered")
        coords = [{"x": x, "y_upper": y, "y_lower": -y}
                  for x, y in naca_4_digit_coordinates("2412")]
        m = generate_wing_mesh_data(g, coords, n_sections=10)
        # Check that trailing edge x-position is constant across span
        te_x_positions = []
        for sec in m["right"]:
            upper = sec["upper"]
            # TE is at max x for the section
            te_x = upper[:, 0].max()
            te_x_positions.append(te_x)
        # All TE x positions should be approximately equal (straight trailing edge)
        mean_te = np.mean(te_x_positions)
        for x in te_x_positions:
            assert x == pytest.approx(mean_te, abs=1e-6)

    def test_ste_wing_area_matches_formula(self):
        g = calculate_geometry(1.5, 2.5, "2412", wing_shape="ste_tapered")
        b = g["wingspan"]
        ar = g["aspect_ratio"]
        assert g["wing_area"] == pytest.approx(b ** 2 / ar, rel=1e-2)

    @pytest.mark.parametrize("wingspan", [0.5, 1.5, 3.0, 10.0])
    def test_ste_scales_with_wingspan(self, wingspan):
        g = calculate_geometry(wingspan, 2.5, "2412", wing_shape="ste_tapered")
        assert g["root_chord"] > 0
        assert g["tip_chord"] > 0
        assert g["wing_area"] > 0
```

---

## Uygulama Sırası

1. `backend/geometry.py` (1a, 1b, 1c)
2. `tests/test_geometry.py` (testleri çalıştır)
3. `templates/index.html`
4. `static/js/viewer3d.js`
5. `static/js/app.js` (gerekirse küçük düzeltme)
6. `static/js/stlexport.js` (gerekirse küçük düzeltme)
7. Son test: `pytest` ve manuel test
