# ZETA 3.0.1 — doğrulama sonucu

8 Ekim 2026.

## Tamamlanan kontroller

- **70 Python testi geçti** (`tests/test_manufacturing.py`, `tests/test_wing_placement.py`). Dört gövde, üç kanat yüksekliği ve üç motor düzenindeki montajlar; diğer çift bomlu kuyruklar; üretim/önizleme konumları; kapalı STL yüzeyleri ve yazıcıya sığacak otomatik bölme kontrol edildi.
- Boru kanallarında yalnız rapor alanı değil, kanal boyunca yerleştirilen silindirin basılı kanatla hacim kesişiminin sıfıra yakın olması denetlendi. Sonraki montaj parçaları kanalı kapatmıyor. Konik kanatta kanal ince firar kenarından dışarı çıkmadan sonlanıyor.
- Çap 0 ile ilgili gerçek hata düzeltildi: arayüzde vaat edildiği gibi yalnız ilgili kanal devre dışı kalıyor. Aşırı büyük ve kanada sığmayan çaplar üretimde hata verir.
- **28 JavaScript testi geçti**. Dört gövde, üç kuyruk düzeni, kanat planformları, motorların ölçü değişimlerini izlemesi ve sunucunun STL yüzeylerinin aynen önizlenmesi denetlendi.
- İzole tarayıcıda JavaScript hatası oluşmadı. Hesaplama, grafikler, bilgi düğmeleri, üretim önizlemesi ve ZIP indirme çalıştı. Ayrıntı satırlarında etiket/değer çakışması açık/koyu tema ve 390 px mobil genişlikte kontrol edildi; ekran görüntüleri görsel olarak incelendi.
- Paketlenmiş Windows uygulaması **3.0.1** sürümüyle açıldı, API hesaplarını yaptı ve **22 parçalı STL ZIP** üretti. Parça boyutları yazıcı hacmine ve ikili STL uzunlukları üçgen sayılarına uydu. Kapatma bildiriminden sonra süreç sonlandı.
- Masaüstü kısayolu test edilmiş 3.0.1 paketine güncellendi. Kurulan dosyanın SHA256 özeti kaynak paketle karşılaştırıldı. Veritabanı değiştirilmedi; önceki uygulama dosyası yedeklendi. Kurulum sonrası `/api/version` 3.0.1 yanıtı verdi.

## Kapsam dışında kalan uygulama eksikleri

Flap, aileron, elevator ve rudder hâlâ basılı kabukla bütünleşiktir. Ayrı hareketli STL, menteşe/pin, servo bağlantısı ve hareket çakışması doğrulaması **tamamlanmadı**. Mevcut paket testleri bu özelliklerin var olduğunu kanıtlamaz.

Kanat/gövde montajlarında istenmeyen hacim kesişimleri ve yerleşimler kontrol edildi. Yazıcı geçme toleransı korunur. Bütün dış yüzey birleşimlerinin sıfır açıklıkta olduğu veya her serbest kullanıcı ölçüsünün test edildiği ileri sürülmez; dış birleşim hattının ayrıca iyileştirilmesi gerekebilir.

Hesap/arayüz/üretim doğrulaması, fiziksel baskı dayanımı veya gerçek uçuş onayı değildir. Daha önceki aerodinamik denetimin kapsamı [denetim raporunda](AUDIT-2026-10-08.md) açıklanır.

## Yayın durumu

GitHub'daki v3.0.0 sürümünün Windows, Linux ve macOS dosyaları doğrulandı. 3.0.1 düzeltmeleri bu doğrulama sırasında yerelde hazırlanıp masaüstüne kuruldu; v3.0.0 etiketi ve dosyaları değiştirilmedi. 3.0.1 henüz GitHub Release olarak yayınlanmadı.
