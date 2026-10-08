# 8 Ekim 2026 — son kullanıcı düzeltmeleri

Bu değişiklikler yayımlanan v3.0.0'dan sonra yapılmaktadır. Tamamlanıp doğrulanmadan yayınlanmış sürümün etiketi değiştirilmez.

- [x] v3.0.0 sürümünde Windows, Linux ve macOS indirilebilir paketleri doğrulandı.
- [x] Eski açık/koyu logo SVG'leri güncel simgeyle eşitlendi.
- [x] Hesap ayrıntılarında etiket, değer ve birimler için ortak sütun düzeni eklendi; koyu panel rengi değiştirildi.
- [x] 3.0.1 masaüstü paketi oluşturuldu, gerçek STL üretimiyle test edildi ve kurulu 2.1.0 kopyasının yerine geçirildi. Kayıtlı veriler korundu.
- [x] Boru kanallarının gerçek boşlukları dört gövde × üç kanat yüksekliği × üç motor düzeninde test edildi; önizleme ve ZIP doğrulandı. Çap 0 girişi ile üretim doğrulamasındaki tutarsızlık giderildi.
- [x] Flap, aileron, elevator ve rudder/ruddervator ayrı STL parçalarıdır; menteşe boşlukları, metal pin erişimi ve ±25° hareket çakışmaları tasarlanıp test edildi. Servo yatağı gerçek servoya göre kullanıcı tarafından ölçülmelidir.
- [x] Temsilî gövde/planform/yükseklik birleşimlerinde montaj parçaları arasındaki istenmeyen hacim kesişimleri, gerçek gövde yüksekliği ve önizleme/üretim kök konumları doğrulandı. Tasarlanan montaj toleransı korunuyor; bu kontrol bütün dış yüzey birleşimlerinin sıfır açıklıkta olduğu iddiası değildir.
- [x] Önizleme/ZIP eşleşmesi, kapalı STL yüzeyleri ve yazıcı hacmi kontrolleri geçti: 70 Python üretim/yerleşim testi, 28 JavaScript testi, açık/koyu/mobil arayüz ve Windows paketinden 22 STL parçalı üretim.
- [x] v3.1.0 doğrulaması [raporlandı](VALIDATION-3.1.0.md); GitHub sürümünde yalnız uygulama kaynakları, testler ve dokümantasyon paylaşılacak. Yerel kullanıcı veritabanı/test çıktıları release kaynağına dahil değildir.
