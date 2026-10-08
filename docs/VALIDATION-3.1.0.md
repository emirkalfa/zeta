# ZETA 3.1.0 doğrulaması

Doğrulama 8 Ekim 2026 tarihinde Windows 11 üzerinde, çalışma ağacındaki v3.1.0 kaynaklarıyla yapıldı.

| Kontrol | Sonuç |
|---|---:|
| STL üretimi, kanat yüksekliği, gövde ve kontrol yüzeyi testleri (`test_manufacturing.py`, `test_wing_placement.py`, `test_control_joints.py`) | 83 geçti |
| API testleri (`test_app.py`) | 17 geçti |
| JavaScript testleri (`node --test tests/*.cjs`) | 29 geçti |
| Windows uygulama paketi | `ZETA-3.1.0-windows-x64.exe` oluşturuldu ve smoke testten geçti |
| Paketlenmiş motordan gerçek STL üretimi | 36 baskı parçası; kapalı üçgen ağ ve yazıcı hacmi kontrolleri geçti |

Özellikle Akın gövdesinin yüksek kanat konumu, klasik ve V kuyruk, ayrıca tek/çift motor düzenleri üretimden geçirildi. Kanat kökü kaplamalarının gövde kabuğuyla kesişen bölgeleri gövdeye tek Boolean birleşimi olarak katılıyor; böylece kesişim yerinde sıfır kalınlıklı iç yüzey oluşmuyor.

ZIP ve STL kontrolleri geometri/topoloji doğrulamasıdır. Filament dayanımı, gerçek bağlantı boşlukları, servo montajı, titreşim ve uçuş performansı fiziksel numune üzerinde doğrulanmış değildir. Uçuş öncesi mekanik yük, CG, kumanda yönü/hareketi ve motor montajı ayrıca kontrol edilmelidir.
