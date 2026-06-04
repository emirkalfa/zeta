# Changelog

Tüm önemli değişiklikler bu dosyada belgelenir. Format [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) standardına uygundur ve proje [Semantic Versioning](https://semver.org/spec/v2.0.0.html) kullanır.

## [Unreleased]

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
- `app.py` `/api/version` endpoint'i — `VERSION` dosyasını döner.
- `app.py` `/healthz` endpoint'i.
- `VERSION` dosyası (tek kaynak).
- `pyproject.toml` (PEP 621 metadata, `setuptools.dynamic.version`).
- `CHANGELOG.md`.
- `.github/workflows/ci.yml` — push/PR'da testler.
- `.github/workflows/release.yml` — `v*` tag'de GitHub Release.
- `.github/release-drafter.yml` — otomatik release notes.
- `scripts/bump_version.py` — semver atlama yardımcısı.
- `RELEASING.md` — release süreci dokümanı.

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

[Unreleased]: https://github.com/emirkalfa/zeta/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/emirkalfa/zeta/compare/v0.2.0...v1.0.0
[0.2.0]: https://github.com/emirkalfa/zeta/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/emirkalfa/zeta/releases/tag/v0.1.0
