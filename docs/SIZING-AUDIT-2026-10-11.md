# ZETA 3.5.12 boyutlandırma doğrulaması

## Değişen davranış

Otomatik kanat alanı `max(b² / AR başlangıç, 2 m g / (ρ Vs hedef² CLmax))` olarak seçilir. Başlangıç AR standart/Tria için 7, çift bomlu modeller için 6'dır. Açıklık ve gövde ölçüleri korunur; yeterli alan varsa eski planform küçültülmez. Veterler milimetreye yukarı yuvarlanır ve alan/MAC bu gerçek ölçülerden yeniden hesaplanır. Profil ve Reynolds sayısı ilk menüden alınır; yoğunluk 1,225 kg/m³'tür.

1,5 m açıklık, NACA 2412, Re=200000 ve 8 m/s hedefinde 2,5 kg için alan 0,450 m², 4 kg için 0,720 m² olur. Tahmini stall her ikisinde yaklaşık 8 m/s'dir. Manuel kanat ve kuyruk ölçüleri değiştirilmez. Hedef stall hızı ilk menüye taşınmıştır; mevcut proje kayıt biçimindeki mission.targetStall alanı korunur.

Kuyruk hesabı `Vh = Sh etkin × Lh / (S × MAC)` ve `Vv = Sv etkin × Lv / (S × b)` kullanır. Lh ve Lv, kanat ile ilgili kuyruk yüzeylerinin alan ağırlıklı çeyrek-veter merkezleri arasındaki mesafelerdir. T-kuyruk ve çift fin yerleşimi veter değiştikçe yeniden çözülür. V-kuyruk toplam fiziksel alanı yatayda cos²(35°), dikeyde sin²(35°) ile değerlendirilir; iki hedef birlikte karşılanır. Tria V-kuyruk hedefleri 0,45/0,03, diğer başlangıç hedefleri 0,70/0,045 olarak korunmuştur.

`htail_arm` artık gerçek yatay aerodinamik merkez mesafesidir; eski hücum kenarı aralığı `tail_le_spacing` olarak ayrı tutulur. Kararlılık, ölçü tablosu ve boyutlandırma aynı mesafeyi kullanır. Dikey merkez ve kol ayrıca raporlanır.

## Doğrulama

- Altı gövde ailesi, üç kuyruk türü, üç kanat şekli, dört açıklık ve kullanılabilir kanat konumlarından oluşan 576 yerleşim. Önizlemenin JavaScript panel geometrisi bağımsız sayısal integrasyonla ölçüldü. En büyük yatay kol farkı 0,000496 mm; alan farkı sayısal hassasiyet düzeyinde; MAC farkı %0,000201 altında. Başlangıç kuyruk hacim hedefleri bütün bu yerleşimlerde karşılandı.
- Geometri, aerodinamik, kararlılık, yeni ağırlık/hedef hesabı, manuel ölçüler, sabit Tria, üç ve beş motorlu VTOL montajları: 138 Python testi geçti. Son manuel koruma kontrolü dahil 113 hızlı test tekrar geçti.
- Mevcut önizleme, hareketli yüzey, proje kaydı, kanat konumu ve arayüz davranışları: 46 JavaScript testi geçti.
- Ayrı test tarayıcısında 8 m/s hedefiyle genişleyen kanat, detaylı gerçek STL önizlemesi, hedefin kaydı ve geri yüklenmesi doğrulandı.
- Hazır Windows paketinde genişleyen kanatlı Atlas/twin tasarımının 60 parçalı ZIP'i ve güncel Tria tasarımının 85 parçalı ZIP'i doğrulandı. Tek kanat pimi, vidalı kök destekleri, dilim bağlantıları, motor mekanizmaları ve karbon boru parçaları korundu.
- Masaüstü uygulaması 3.5.12 ile güncellendi; dosya özeti, sürüm uç noktası ve kurulu uygulamanın yeni hesap sonuçları doğrulandı. Kayıtlı projeler silinmedi.

## Kapsam

Bu doğrulama geometri ile hesapların tutarlılığıdır. CLmax kalibre edilmemiş profil tahminidir; çeyrek-veter merkezleri ve kuyruk hacim hedefleri ön tasarım yaklaşımıdır. Gerçek kaldırma, ağırlık merkezi, yapısal dayanım ve uçuş için ölçülmüş polarlar, gerçek donanım ve deney gerekir. Gövde ailesinin temel ölçü politikası değiştirilmedi. Özellikle çok büyük açıklıklı sabit Tria yerleşiminde motor/pervane için yeterli açık boru bölümü yoksa üretim kontrolü hâlâ işlemi durdurur; bu fiziksel çakışma kontrolü kaldırılmadı.

## Kaynaklar

- [NASA, kaldırma denklemi](https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/lift-equation/)
- [CODE Lab, kuyruk hacmi ve aerodinamik merkez mesafesi](https://computationaldesignlab.github.io/aircraft-design/tail_sizing.html)
- [UIUC, ölçülmüş düşük Reynolds profil verileri](https://m-selig.ae.illinois.edu/uiuc_lsat.html)
