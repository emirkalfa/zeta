# Sürüm Yayınlama

ZETA sürümleri bir `v*` etiketi itildiğinde GitHub Actions tarafından otomatik yayınlanır. Elle yapılacak iş sürüm numarasını yükseltmek, değişiklik notlarını gözden geçirmek ve etiketi itmektir.

## İş akışları

| Dosya | Ne zaman çalışır | Ne yapar |
|-------|------------------|----------|
| `ci.yml` | Ana dala her push ve her PR | Testler (Linux'ta Python 3.10–3.13, Windows ve macOS'ta 3.12), kaynak koddan duman testi, JavaScript sözdizimi kontrolü, ardından paketleme |
| `build.yml` | CI ve Release tarafından çağrılır; Actions sekmesinden elle de başlatılabilir | Linux AppImage, Windows `.exe` ve macOS `.app` üretir, her paketi çalıştırıp dener, 14 gün saklanan artifact olarak yükler |
| `release.yml` | `v*` etiketi itildiğinde | Etiket, `VERSION` ve `CHANGELOG.md` uyumunu doğrular, CI'ın tamamını çalıştırır, paketleri ve `SHA256SUMS.txt` dosyasını GitHub Release'e ekler |

Herhangi bir adım başarısız olursa Release oluşturulmaz.

## Sürüm numarası

[Semantic Versioning](https://semver.org/) kullanılır: `MAJOR.MINOR.PATCH`.

- **MAJOR**: geriye uyumsuz değişiklik (API alanı kaldırma, kayıtlı proje biçimini bozma)
- **MINOR**: geriye uyumlu yeni özellik
- **PATCH**: hata düzeltmesi, doküman, iç düzenleme

Sürümün tek kaynağı `VERSION` dosyasıdır. `pyproject.toml`, `app.py` (`/api/version`), paket dosya adları ve arayüzdeki sürüm etiketi buradan okur.

`1.4.0-rc.1` gibi tire içeren sürümler GitHub'da ön sürüm olarak işaretlenir.

## Adımlar

```bash
# 1. Ana dal güncel ve temiz olsun
git checkout main && git pull

# 2. Sürümü yükselt: patch, minor, major ya da açık bir sürüm (ör. 1.4.0-rc.1)
python scripts/bump_version.py minor
```

Betik `VERSION` dosyasını günceller, `CHANGELOG.md` içindeki `[Unreleased]` başlığının altına tarihli yeni sürüm başlığını açar ve dosya sonundaki karşılaştırma bağlantılarını düzeltir.

```bash
# 3. CHANGELOG'daki yeni bölümü gözden geçir, yayın notlarını önizle
python scripts/release_notes.py v1.4.0

# 4. Commit, etiket, push
git commit -am "release: v1.4.0"
git tag -a v1.4.0 -m "Release v1.4.0"
git push origin HEAD v1.4.0
```

Etiket itildikten sonra Actions sekmesinde **Release** iş akışı çalışır. Bittiğinde Releases sayfasında şunlar bulunmalıdır:

- `ZETA-<sürüm>-linux-x86_64.AppImage`
- `ZETA-<sürüm>-windows-x64.exe`
- `ZETA-<sürüm>-macos-arm64.zip`
- `SHA256SUMS.txt`

Yayın notları `CHANGELOG.md` içindeki ilgili bölümden alınır; bu yüzden geliştirme sırasında her değişikliği `[Unreleased]` altına yazmak yeterlidir.

## Yerelde paket üretmek

```bash
pip install -e ".[build]"
python packaging/build.py                      # dist/release/ altına yazar
python scripts/smoke_test.py dist/release/ZETA-*.AppImage
```

`build.py` yalnızca üzerinde çalıştığı işletim sisteminin paketini üretir. Duman testi uygulamayı başlatır, arayüz dosyalarının pakete girdiğini ve hesap uç noktalarını dener, sonra uygulamanın kendini kapattığını doğrular.

## Sorun giderme

**"etiket vX, VERSION dosyası Y" hatası:** etiket `VERSION` ile eşleşmiyor. Etiketi silin, sürümü düzeltin, yeniden etiketleyin:

```bash
git tag -d v1.4.0
git push origin :refs/tags/v1.4.0
python scripts/bump_version.py 1.4.0
git commit -am "release: v1.4.0"
git tag -a v1.4.0 -m "Release v1.4.0"
git push origin HEAD v1.4.0
```

**"CHANGELOG.md içinde bölüm yok ya da boş" hatası:** başlık tam olarak `## [1.4.0] - YYYY-AA-GG` biçiminde olmalı ve altında en az bir satır bulunmalıdır.

**Release oluşturulamıyor (403):** depo ayarlarında Settings → Actions → General → Workflow permissions altında yazma izni kapalı olabilir. `release.yml` yalnızca yayın işinde `contents: write` ister.

**Paketler imzasızdır.** Windows SmartScreen ve macOS Gatekeeper ilk açılışta uyarı gösterir; kullanıcıya gösterilecek adımlar README'dedir. Kod imzalama eklemek için sertifikalar depo sırlarına konup `build.yml` içine imzalama adımı eklenmelidir.
