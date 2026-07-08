# Release Süreci

Bu doküman ZETA için versiyon yönetimi ve release yayınlama adımlarını açıklar.

## Versiyon Şeması

[Semantic Versioning](https://semver.org/) — `MAJOR.MINOR.PATCH` (örn. `0.2.0`).

- **MAJOR**: Geriye uyumsuz API/komut davranışı değişiklikleri.
- **MINOR**: Geriye uyumlu yeni özellikler.
- **PATCH**: Geriye uyumlu hata düzeltmeleri, dokümantasyon, refactor.

**Mevcut sürüm:** `VERSION` dosyasından okunur (tek kaynak). `pyproject.toml`
`setuptools.dynamic.version` ile bunu otomatik çeker. `app.py` `APP_VERSION`
sabitine yükler ve `/api/version` endpoint'inde döner.

## Branch Stratejisi

- `main` — kararlı sürüm, her release sonrası güncellenir.
- `feat/*`, `fix/*` — geliştirme branch'leri. PR yoluyla `main`'e birleşir.
- `v*` tag'leri — release işaretçileri.

CI (`ci.yml`) `main` push'larında + tüm PR'larda test çalıştırır.
Release workflow (`release.yml`) sadece `v*` tag push'unda tetiklenir,
otomatik olarak GitHub Release oluşturur.

## Release Yayınlama Adımları

### 1. Hazırlık

```bash
# main'i güncelle
git checkout main
git pull origin main

# Tüm testlerin geçtiğinden emin ol
python -m pytest -q
```

### 2. Versiyonu Yükselt

Otomatik (önerilen):

```bash
python scripts/bump_version.py minor   # veya patch/major/0.3.0
```

Bu komut:
- `VERSION` dosyasını günceller
- `CHANGELOG.md` `[Unreleased]` bölümünü yeni tarihle değiştirir
- Sonraki commit/tag komutlarını yazdırır

Manuel alternatif:

```bash
# VERSION: 0.2.0 -> 0.3.0
echo "0.3.0" > VERSION
```

### 3. CHANGELOG'u Düzenle

`CHANGELOG.md` yeni sürüm bölümünü doldur:

```markdown
## [0.3.0] - 2026-06-XX

### Added
- Yeni özellik açıklaması (#PR_NUM) @kullanici

### Fixed
- Bug düzeltmesi (#PR_NUM) @kullanici
```

### 4. Commit + Tag

```bash
git add VERSION CHANGELOG.md
git commit -m "release: v0.3.0"
git tag -a v0.3.0 -m "Release v0.3.0"
git push origin main
git push origin v0.3.0
```

### 5. Release Workflow

`v*` tag push'unda `release.yml` otomatik olarak:

1. Testleri çalıştırır
2. sdist + wheel build eder
3. GitHub Release oluşturur ve artifact'leri ekler

### 6. Doğrulama

Release yayınlandıktan sonra:

- https://github.com/emirkalfa/zeta/releases adresinde yeni sürüm görünmeli
- Artifact'ler indirilebilir olmalı
- `pip install` ile wheel kurulabilmeli (test edin)

## Hotfix (Acil Düzeltme)

`main`'de kritik bug varsa:

```bash
git checkout -b fix/critical-bug main
# düzelt + test
git commit -m "fix: kritik bug"
git push origin fix/critical-bug
# PR aç -> main'e merge
# sonra normal release akışı (patch bump)
```

## İlk Yayın (0.1.0)

Eğer hiç tag yoksa:

```bash
# 0.1.0 sürümü için
echo "0.1.0" > VERSION
# CHANGELOG.md'e 0.1.0 bölümü ekle (Unreleased'i düzenle)
git add VERSION CHANGELOG.md
git commit -m "release: v0.1.0"
git tag -a v0.1.0 -m "Release v0.1.0"
git push origin main --tags
```

## Troubleshooting

**"VERSION != tag" hatası:** Tag ile `VERSION` dosyası eşleşmiyor. Tag'i sil,
`VERSION`'u düzelt, tekrar tag'le:

```bash
git tag -d v0.3.0
git push origin :refs/tags/v0.3.0
# VERSION'ı düzelt
git commit -am "fix: VERSION dosyasi"
git tag -a v0.3.0 -m "Release v0.3.0"
git push origin main --tags
```

**Workflow izinleri:** GitHub repo Settings → Actions → Workflow permissions
→ "Read and write permissions" açık olmalı (GH Release için).

**CHANGELOG excerpt boş:** `CHANGELOG.md`'de `[0.3.0]` başlığı tam olarak
`## [0.3.0] - YYYY-AA-GG` formatında olmalı.
