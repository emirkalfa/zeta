const studioEnglish = new Map(`
Uçak tasarım stüdyosu|Aircraft design studio
ZETA · Uçak Tasarım Stüdyosu|ZETA · Aircraft Design Studio
ZETA, uçak tasarım stüdyosu|ZETA, aircraft design studio
ZETA · Sabit kanatlı uçak ve İHA tasarım aracı ·|ZETA · Fixed-wing aircraft and UAV design tool ·
Parametreler|Settings
Ölçüler|Dimensions
Gövde|Fuselage
Analiz|Analysis
Ön değerlendirme|Flight assessment
Görev|Mission
Hazır modeller|Preset models
STL indirme|STL downloads
Tasarım adımları ilk hesaplamadan sonra açılır.|Calculate a design to unlock the remaining steps.
Temayı değiştir|Switch theme
Karanlık / aydınlık tema|Dark / light theme
Açık temaya geç|Switch to light theme
Koyu temaya geç|Switch to dark theme
Dil / Language|Language
Uçak parametreleri|Aircraft settings
Ölçülerini belirle. Modelini incele. Baskıya hazırla.|Set your dimensions, inspect the model, and prepare it for printing.
Hesaplama modu|Calculation mode
Otomatik|Automatic
Manuel|Manual
Ayar kategorileri|Settings categories
Kanat|Wing
Motor|Motor
Kuyruk|Tail
Kanat ayarları|Wing settings
Gövde ayarları|Fuselage settings
Motor ayarları|Motor settings
Kuyruk ayarları|Tail settings
Model ailesi|Aircraft family
Mevcut sabit kanat modelleri|Fixed-wing models
Tria VTOL · 3 motor|Tria VTOL · 3 motors
Penta VTOL · 5 motor|Penta VTOL · 5 motors
Kanat açıklığı|Wingspan
Ağırlık|Weight
Kanat boyutlandırma|Wing sizing
Standart|Standard
Sakin uçuş / süzülüş|Gentle flight / glide
Stall hızı, en fazla|Maximum stall speed
Yatay kuyruk|Horizontal tail
Dikey kuyruk|Vertical tail
Kanat şekli|Wing planform
Konik|Tapered
Dikdörtgen|Rectangular
Düz firar kenarlı|Straight trailing edge
Her kanatta hareketli yüzey|Control surfaces per wing
Çift · ayrı flap ve aileron|Two · separate flap and aileron
Tek · flaperon|One · flaperon
Merkezden flap başlangıcı|Flap start from centerline
Flap uzunluğu|Flap span
Flap genişliği|Flap chord
Başlangıç ve uzunluk yarı kanat açıklığının, genişlik yerel veterin yüzdesidir. Tek yüzey seçiliyken ayarlar flaperona uygulanır. Otomatik ölçü için alanı boş bırakın.|Start and span are percentages of the wing semispan. Flap chord is a percentage of local wing chord. For one control surface these settings apply to the flaperon. Leave a field blank for automatic sizing.
Kanat konumu|Wing position
Alçak|Low
Orta|Mid
Yüksek|High
İlk hesaplamadan sonra konum seçimi modeli otomatik yeniler. Kanat motorları ve montaj yuvaları birlikte taşınır.|After the first calculation, changing wing position refreshes the model and moves the wing motors and mounts with the wing.
Kuyruk tipi|Tail type
Konvansiyonel|Conventional
Kuyruk bağlantıları seçilen gövde yerleşimine göre oluşturulur.|Tail mounts follow the selected fuselage layout.
Gövde tipi|Fuselage type
Gövde koleksiyonu|Fuselage library
Özgün (kesitlerle)|Custom sections
Hesaplamadan sonra Gövde adımında Goliath, Caraxes, Lark veya Savaşan İHA modelini seçebilirsiniz.|After calculation, choose Goliath, Caraxes, Lark, or the competition UAV in Fuselage.
Analiz ayarları|Analysis settings
Aerodinamik hesabın koşulları.|Conditions used for the aerodynamic estimate.
Reynolds sayısı|Reynolds number
Model uçaklar için 50.000–500.000|50,000–500,000 for model aircraft
Maks. hücum açısı|Maximum angle of attack
Grafiklerin α aralığı (10°–40°)|Chart range for α (10°–40°)
Görev ve güç sistemi|Mission and power system
Hız, havada kalış ve manevra hesabı için. Yarışma profili uçağı çift bomlu, itici pervaneli yerleşimle boyutlandırır ve sonuçları hedeflerinizle karşılaştırır.|Estimate speed, endurance, and maneuver performance. The competition profile sizes a twin-boom pusher and compares results with your targets.
Görev profili|Mission profile
Genel model uçak|General model aircraft
Yarışma İHA'sı (Savaşan İHA vb.)|Competition UAV
Motorların toplam elektrik gücü|Total motor electrical power
Motorun azami elektrik gücü|Maximum motor electrical power
Batarya enerjisi|Battery energy
Ör. 4S 5000 mAh ≈ 74 Wh|e.g. 4S 5000 mAh ≈ 74 Wh
Aviyonik tüketimi|Avionics power
Otopilot, görev bilgisayarı, kamera|Autopilot, flight computer, camera
Yük faktörü sınırı|Load factor limit
Yapının taşıyabildiği azami g|Maximum structural load in g
Toplam tahrik verimi|Overall propulsion efficiency
Görev hedefleri|Mission targets
Havada kalış, en az|Minimum endurance
Sürekli dönüş, en az|Minimum sustained turn rate
Hedefler başlangıç değerleridir; güncel yarışma şartnamesine ve takım stratejinize göre düzenleyin.|Adjust the starting targets to your competition requirements.
Örnek yarışma İHA'sı değerlerini yükle|Load competition UAV example
2 m açıklık, 5 kg, 1200 W, 6S 10 Ah|2 m span, 5 kg, 1200 W, 6S 10 Ah
Açıklık|Span
Kök veter|Root chord
Uç veter|Tip chord
Ok açısı|Sweep angle
Dihedral açısı|Dihedral angle
BLDC motor ve pervane montajı|BLDC motor and propeller mounting
Ölçüler örnektir; satın alacağınız motorun arka bağlantı ölçülerini girin. Kanat açıklığı değişse de motor ve vida ölçüleri korunur.|Enter your motor's rear mounting dimensions. Motor and screw dimensions stay fixed as wingspan changes.
Motor yerleşimi|Motor layout
Montaj ekleme|No mount
Tek motor, kuyruk pervanesi|Single rear pusher
Çift motor, sağ ve sol kanat|Twin wing motors
Dört vida düzeni|Four-screw pattern
Çapraz: iki karşılıklı çift|Cross: two opposing pairs
Dikdörtgen: dört köşe|Rectangle: four corners
Motor dış çapı|Motor outside diameter
Montaj yüzünden motorun önüne uzunluk|Length from mounting face to motor front
Dikey vida aralığı|Vertical screw spacing
Yatay vida aralığı|Horizontal screw spacing
Motor vidası çapı|Motor screw diameter
Arka mil/çıkıntı için orta delik|Center bore for rear shaft
Motor bağlantı plakası kalınlığı|Motor plate thickness
Motor kablo geçiş çapı|Motor wire opening diameter
Pervane uçtan uca çapı|Propeller diameter
Motor önünden pervane düzlemine mesafe|Distance from motor front to propeller plane
Kanattaki konum: kökten uca|Wing station from root to tip
Motor ve pervane ölçü referansını göster|Show motor and propeller reference
Motor ve pervane: ölçü referansı|Motor and propeller reference
Çapraz düzende aralıklar karşılıklı deliklerin merkezleri arasındadır; dikdörtgen düzende köşe deliklerinin dikey/yatay aralıklarıdır. Üretim önizlemesi gerçek delikleri gösterir. Motor ve pervane görüntüleri STL'ye eklenmez; taşıyıcılar gövde/kanat STL'sine dahildir. Güç hesabına tüm motorların toplam elektrik gücünü girin.|Measure opposing hole centers for a cross pattern and horizontal or vertical spacing for a rectangle. The print preview shows the actual holes. STL files include mounts. Enter the total electrical power of all motors.
Burun kamerası|Nose camera
Kamera yuvası|Camera mount
Ekleme|Do not add
Ortalanmış lens açıklığı ve iki yan vida|Centered lens opening and two side screws
Kamera genişliği|Camera width
Kamera yüksekliği|Camera height
Kamera kasa derinliği|Camera body depth
Lens açıklığı çapı|Lens opening diameter
Yan vida çapı|Side screw diameter
Ön yüzden vida merkezine mesafe|Screw center offset from front face
Üst yüzden vida merkezine mesafe|Screw center offset from top face
Lens burun eksenine ortalanır. Kamerayı alttan yerleştirip iki yandaki vida deliklerinden bağlayın. Kamera kasası, lens ve vida merkezlerini ölçerek girin.|The lens is centered on the nose axis. Insert the camera from below and fasten it with the side screws. Measure the body, lens, and hole centers.
Projelerim|My projects
Proje adı|Project name
Örneğin: Eğitim uçağım|e.g. My trainer
Tasarımı kaydet|Save design
Seçili projeyi aç|Open selected project
Proje dosyasını indir|Download project file
Bilgisayardan aç|Open from computer
Kayıtlar yükleniyor…|Loading saved projects…
Son tasarım bu bilgisayara otomatik kaydedilir.|Your latest design is automatically saved on this computer.
Her kayıt ayrı bir kopyadır. Proje açarken mevcut tasarım otomatik yedeklenir.|Each save creates a copy. Opening a project backs up your current design.
Kaydediliyor…|Saving…
Hesapla|Calculate
Hesaplanıyor…|Calculating…
Geometrik ölçüler|Aircraft dimensions
Girilen parametrelerden hesaplanan kanat, gövde ve kuyruk boyutları.|Wing, fuselage, and tail dimensions calculated from your inputs.
3D model|3D model
Üretim önizlemesi|Print preview
Detaylı model hesaplamadan sonra hazırlanır.|The detailed model appears after calculation.
Sürükle: döndür · Tekerlek: yakınlaştır|Drag to orbit · Scroll to zoom
Sürükleyerek döndürün, sağ tuşla kaydırın, tekerlekle yakınlaştırın.|Drag to orbit, right-drag to pan, and scroll to zoom.
Bakış yönü|View
Ön|Front
Üst|Top
X ekseni boyunca bakış|View along the X axis
Y ekseni boyunca bakış|View along the Y axis
Z ekseni boyunca bakış|View along the Z axis
Döndür|Rotate
Sıfırla|Reset
Renk açıklaması|Color legend
Kontrol yüzeyi|Control surface
Servis kapağı|Service hatch
Servis kapaklarını göster|Show service hatches
Servis kapakları|Service hatches
Ön servis kapağını göster|Show front service hatch
Arka servis kapağını göster|Show rear service hatch
Burun ızgara kapağını göster|Show nose grille cover
İç yapıyı göster|Show internal structure
Baskı parçası|Print part
Parça seç|Select part
Seçili parçayı STL olarak indir|Download selected part as STL
Tüm modeli göster|Show full model
Kontrol parçası hareketi|Control surface motion
Hareketli kontrol yüzeyi|Moving control surface
Menteşe açısı|Hinge angle
Bağlantı noktası|Mounting point
Yakın plan|Close-up
Gerçek STL parçaları hazır olduğunda vida delikleri ve montaj noktalarını tek tek yakınlaştırabilirsiniz.|Inspect screw holes and mounting points once the print preview is ready.
Ağırlık merkezi (CG)|Center of gravity (CG)
Ağırlık merkezi ve kanat yerleşimi|Center of gravity and wing placement
Kanadın boyuna konumu|Longitudinal wing position
Üstten görünüm. Burun solda, kuyruk sağda.|Top view. Nose on the left, tail on the right.
Önde|Forward
Ortada|Centered
Geride|Aft
Gövde tasarımı|Fuselage design
SEÇİLİ GÖVDE|SELECTED FUSELAGE
Gövde modelleri|Fuselage models
Gövde oranları|Fuselage proportions
Genişlik|Width
Yükseklik|Height
Kesitlerle düzenle|Edit sections
Özgün kesitler · metre|Custom sections · meters
Kanat ve kuyruğu göster|Show wings and tail
Görsel ön tasarım. Hacim değişiklikleri aerodinamik hesaplara henüz yansıtılmaz.|Concept preview. Volume edits do not feed into the aerodynamic estimate.
Uçağınıza bir karakter seçin. Gövdeyi şekillendirin, sonucu anında görün.|Choose a fuselage and adjust its shape in the preview.
Aerodinamik analiz|Aerodynamic analysis
Lifting-line teorisiyle hesaplanan kanat polarları. Değerleri görmek için eğrilerin üzerine gelin.|Wing polars estimated with lifting-line theory. Hover over a curve for values.
Kaldırma eğrisi|Lift curve
Sürükleme poları|Drag polar
Yunuslama momenti|Pitching moment
Aerodinamik verim|Aerodynamic efficiency
Açıklık boyunca kaldırma dağılımı|Spanwise lift distribution
Veri tablosu|Data table
Uçuş ön değerlendirmesi|Preliminary flight assessment
Stall hızı, tırmanma ve statik kararlılık kriterlerine göre değerlendirme.|Assessment based on stall speed, climb, and static stability.
Teorik ön hesap|Theoretical estimate
Görev performansı|Mission performance
Güç sistemine göre hız zarfı, havada kalış ve dönüş (manevra) performansı.|Speed envelope, endurance, and turning performance based on the power system.
Dönüş hızı|Turn rate
Güç eğrisi|Power curve
Hesap ayrıntıları|Calculation details
Duvar kalınlığı|Wall thickness
Tüm STL çıktılarına uygulanır.|Applies to all STL outputs.
Montajlı üretim için 0,8–4 mm. Baskı ve malzemenize göre seçin.|Use 0.8–4 mm for assembled prints, depending on printer and material.
Kanat iç yapısı|Wing internal structure
Ana karbon boru delik çapı|Main carbon tube bore
Arka karbon boru delik çapı|Rear carbon tube bore
Ana boru kök konumu|Main tube root position
Arka boru kök konumu|Rear tube root position
0 = kanal kapalı. Konumu aşağıdan ayarlanır.|0 disables the channel. Set its position below.
0 = yok. Kanal hareketli parçanın menteşesinden önce sonlanır.|0 disables the channel. The bore ends before the control hinge.
Rib aralığı|Rib spacing
Rib kalınlığı|Rib thickness
Yazıcı ve montaj ölçüleri|Printer and assembly dimensions
Başlangıç değerleri örnektir. Kendi yazıcınızın ve satın aldığınız vida/somunun ölçülerini girin.|Enter your printer's dimensions and the actual screw and nut sizes.
Tabla genişliği|Bed width
Tabla derinliği|Bed depth
Baskı yüksekliği|Print height
Geçme boşluğu (toplam)|Total fit clearance
Dilim, kapak ve kuyruk vida çapı|Segment, hatch, and tail screw diameter
Kanat sabitleme pimi çapı|Wing retention pin diameter
Kanat kökü oturma derinliği|Wing root seat depth
Somun karşılıklı yüz mesafesi|Nut width across flats
Somun kalınlığı|Nut thickness
Menteşe metal pim çapı|Metal hinge pin diameter
Kanat dilim bağlantısı|Wing segment joints
Geçmeli ve vidalı|Interlocking and bolted
Yapıştırmalı (önceki yöntem)|Glued
Üst kapak bağlantısı|Upper hatch fastening
Tırnaklı geçme|Snap fit
Vidalı|Screwed
STL hazırlama durumu|STL preparation status
STL üretimi için önce modeli hesaplayın.|Calculate the model before producing STLs.
Simülasyon dışa aktarımı|Simulation export
Simülasyon STL|Simulation STL
Parçalı STL indirme|Segmented STL downloads
Parçalı STL indir (ZIP)|Download segmented STL (ZIP)
Hareketli kontrol parçaları|Moving control parts
Kontrol parçaları (ZIP)|Control parts (ZIP)
Gövde ve kapak|Fuselage and hatch
Tüm STL parçaları (ZIP)|All STL parts (ZIP)
Tüm parçaları STL olarak indir (ZIP)|Download all parts as STL (ZIP)
Yazıcı hacmine göre bölünmüş, montaj bağlantıları işlenmiş parçaları ZIP paketinde indirin.|Download printable segments with assembly features as a ZIP.
STL, STEP ve bağlantı şeması (ZIP)|STL, STEP, and assembly drawings (ZIP)
Kuyruk bağlantısı|Tail mount
PARAMETRE REHBERİ|PARAMETER GUIDE
Kaynaklar ve yöntem|Sources and methods
Bilgiyi kapat|Close help
Sol ön motor|Left front motor
Sağ ön motor|Right front motor
VTOL hareket önizlemesi|VTOL motion preview
Motor üçgeni ve denge|Motor triangle and balance
Tria VTOL özel ayarları|Tria VTOL settings
Penta VTOL kaldırma motorları|Penta VTOL lift motors
Ölçüler ve mekanizma hakkında|Dimensions and mechanism
Tilt rotor referansı|Tilt rotor reference
Analiz kapsamı|Analysis scope
Beşinci motor: arka itici BLDC|Fifth motor: rear BLDC pusher
İrtifa dümeni · tek parça|Elevator · one piece
Ön kapak|Front hatch
Arka kapak|Rear hatch
Tüm gövde, kanat ve kuyruk parçaları gösteriliyor.|Showing all fuselage, wing, and tail parts.
Ayarları değiştirdikten sonra üretim kontrolünü yeniden çalıştırın.|Run the print check again after changing settings.
Bu ayarda vida/bağlantı noktası bulunamadı. Motor bağlantıları için önce motor yerleşimi seçin.|No mounting points in this configuration. Choose a motor layout to see motor mounts.
% veter|% chord
Bu bilgisayardaki projeler|Projects on this computer
Proje olarak kaydet|Save as project
Tabla eni|Bed width
0° dikey kalkış konumu, 90° ileri uçuş konumu. STL parçaları dikey referans konumunda hazırlanır.|0° is vertical takeoff and 90° is forward flight. STLs use the vertical reference position.
Bu sonuç uçuş onayı değildir. Gerçek ağırlık merkezi, motor/pervane ölçümleri, baskı dayanımı ve kontrol yüzeyleri doğrulanmalıdır. Profil katsayıları deneysel polar yerine teorik ve yaklaşık modellerden hesaplanır.|This estimate is not flight approval. Verify actual CG, propulsion, print strength, and control surfaces. Airfoil coefficients come from approximate theoretical models.
Delik çapını borunuzun dış çapı ve istediğiniz geçme payının toplamı olarak girin. Her kanat yarısı kendi ekseninde boru taşır. Duvar kalınlığı 0,8–4 mm olmalıdır.|Enter tube outside diameter plus fit clearance. Each wing half carries its own tube. Wall thickness must be 0.8–4 mm.
Grafikler kanat için teorik ön hesapları gösterir. Gövde/kuyruk sürüklemesi ve momenti dahil değildir. Stall sonrası eğriler yaklaşık bir modeldir; ölçülmüş rüzgâr tüneli verisi değildir.|Charts show theoretical wing estimates. Fuselage and tail drag and moments are excluded. Post-stall curves are approximate.
Her ZIP içinde baskı parçaları ayrı STL dosyalarıdır. Parçaların boyutunu yukarıdaki yazıcı ölçüleri belirler; bağlantı yuvaları ve vida delikleri korunur.|Each ZIP contains individual STL files sized to the print volume, with mounting sockets and screw holes preserved.
Hesap parabolik sürükleme polarına ve hızdan bağımsız mevcut güce dayanır; rüzgâr, tırmanma ve manevra sırasındaki ek tüketim havada kalış süresine dahil değildir. Gerçek uçuşta süre daha kısa olur.|The estimate uses a parabolic drag polar and constant available power. It excludes wind and additional consumption from climbing and maneuvering. Actual endurance is shorter.
Kanat içi boş üretilir; rib'ler boşluğu bölmelere ayırır ve iskelet (spar) boruları rib'lerdeki deliklerden geçer.|The wing is hollow. Ribs divide the cavity and spar tubes pass through their bores.
Kanat ve kuyruk köklerindeki geçme parçaları, gövdedeki pah girişli yuvalara oturur. Eşleşen vida delikleri ve somun cepleri STL paketine dahildir. T kuyrukta yatay yüzeyin yuvası dikey kuyruktadır.|Wing and tail root keys fit chamfered fuselage sockets. The STL package includes matching screw holes and nut pockets. The T-tail stabilizer mounts on the fin.
Kanat, kuyruk ve alternatif gövde baskı parçalarını orijinal ölçüleriyle dışa aktar.|Export the original-size wing, tail, and alternate fuselage pieces.
Kompakt yan gövde içindeki servo, metal servo koluyla motor taşıyıcısını doğrudan döndürür. Servo milinin ön kenara uzaklığını, kasa ölçülerini ve metal kolun dört vida yarıçapını ölçerek gir. Metal pivot mili motor yükünü taşıyan yataktır. Ön motorlar dikeyden 20° geriye ve 90° ileri dönebilir. Servis kapağını açarak servo ve kabloya erişirsin. Servo, metal kol, mil, motor ve pervane satın alınır; STL içinde bulunmaz. Gerçek servo uyumu ve yük testi gerekir.|The servo uses a metal horn to rotate the motor mount directly. Measure the servo shaft offset, case dimensions, and four-screw horn radius. The metal pivot bears the motor load. The front motors tilt 20° rearward or 90° forward from vertical. Open the service hatch for servo and wiring access. Purchase the hardware and verify servo fit and load capacity.
Merkusim için gövde STL’sini indir ve Merkusim’in STL yükleme ekranına bırak. ZETA proje dosyasını da yüklersen Merkusim model türünü ve kütleyi okur. Motor ve iniş takımı Merkusim’in seçili araç şablonundan gelir.|Import the fuselage STL in Merkusim. Optionally load the ZETA project to transfer the model type and mass. Motors and landing gear come from the selected Merkusim vehicle template.
Sağ ve sol kanat, yazıcı ölçülerine göre numaralı ayrı STL dosyalarına bölünür.|Left and right wings are divided into numbered STL files to fit your printer.
Seçilen kanat yüzeyleri ve kuyruk kumandaları ayrı STL dosyaları; pim ölçüleri ve menteşe deneme parçalarıyla.|Separate STL files for wing and tail controls, with pin sizes and hinge fit samples.
Seçili kuyruk tipinin yüzeyleri, ayrı ve numaralı STL dosyaları olarak indirilir.|Download the selected tail surfaces as separate numbered STL files.
Tria VTOL mekanik prototipi. Grafikler sabit kanat ön hesabıdır; dikey kalkış, servo torku ve geçiş uçuşu doğrulanmış değildir.|Tria VTOL mechanical prototype. Charts cover fixed-wing estimates. Vertical takeoff, servo torque, and transition flight have not been validated.
Vida delikli ayrı kapak, karşı somun yuvaları ve iç hizalama bilezikleri.|Separate hatch, screw holes, nut pockets, and internal alignment sleeves.
ZIP dosyasını açıp içindeki STL dosyalarını ayrı ayrı dilimleyiciye aktarın. Örneğin|Unzip the archive and load STL files individually into your slicer. For example,
dört sağ kanat parçasının ilkidir. Gövdede numaralar burundan kuyruğa, kanatta kökten uca ilerler. Ayrı kapak da pakettedir. Vidalı kanat modunda dilimler iç geçmelerle kenetlenip vidalanır; diğer dilimlerin montaj yöntemi ZIP içindeki MONTAJ.txt dosyasında belirtilir.|is the first of four right wing segments. Fuselage parts are numbered nose to tail and wing parts root to tip. The hatch is included. Bolted wing segments interlock and use screws. See MONTAJ.txt for assembly.
İki bağımsız döner ön motor, bir sabit dikey arka motor. Ortak ölçüler üç motor için geçerlidir.|Two independently tilting front motors and one fixed vertical rear motor. Shared dimensions apply to all three.
Motor ve pervane|Motor and propeller
Kuyruk yatay hacim hedefi|Horizontal tail volume target
Kuyruk dikey hacim hedefi|Vertical tail volume target
Motor uzunluğu|Motor length
Pervane çapı|Propeller diameter
Motor vida aralığı X|Motor screw spacing X
Motor vida aralığı Z|Motor screw spacing Z
Mil açıklığı|Shaft clearance
Ön motor konumu|Front motor station
Kanat önünden uzaklık|Distance forward of wing
Ön pivot yüksekliği|Front pivot height
Arka taşıyıcı yüksekliği|Rear mount height
Arka motor konumu|Rear motor station
Metal pivot mili çapı|Metal pivot shaft diameter
Servo kasa uzunluğu|Servo case length
Servo kasa genişliği|Servo case width
Servo kasa yüksekliği|Servo case height
Servo kulak vida aralığı|Servo lug screw spacing
Servo önünden mil merkezine uzaklık|Shaft center offset from servo front
Metal servo kolu vida yarıçapı|Metal servo horn screw radius
Servo kolu bağlantı vidası|Servo horn mounting screw
Karbon kuyruk borusu dış çapı|Carbon tail tube outside diameter
Karbon kuyruk borusu iç çapı|Carbon tail tube inside diameter
Borunun gövdeye girme uzunluğu|Tube insertion into fuselage
Kanat önünde ve arkasında boşluk|Clearance ahead of and behind wing
Servo ve döner mekanizma|Servo and tilt mechanism
Karbon kuyruk borusu|Carbon tail tube
Kuyruk boyutlandırma|Tail sizing
% yarı kanat|% semispan
% açık boru|% exposed tube
Tria gövdesi kanat açıklığına göre boyutlanır. Kanat yuvası gövde orta hattındadır. İki bağımsız döner ön motor ve bir sabit dikey arka motor bulunur.|The Tria fuselage scales with wingspan. The wing is mounted on the fuselage centerline. Two front motors tilt independently and the rear lift motor is fixed.
Kanat açıklığı, veter ve motor ölçüsüne otomatik uyarlanan kısa gövde. Kanat gövde orta hattında sabittir. Ön motorlar kısa taşıyıcılara, arka motorlar karbon boru kelepçelerine oturur. Bu ölçüler dört kaldırma motoruna uygulanır; arkadaki beşinci itici motorun ölçülerini BLDC bölümünden gir. Çift bom ve ikiz finli yatay kuyruk otomatik oluşturulur.|Compact pod sized to span, chord, and motor dimensions. The wing sits on the fuselage centerline. Short mounts hold the front motors and carbon tube clamps hold the rear lift motors. These dimensions cover four lift motors. Set the fifth pusher in BLDC mounting. The twin-boom, twin-fin tail is generated automatically.
Kanat alanı|Wing area
Açıklık oranı|Aspect ratio
Kanat yüklemesi|Wing loading
Hedef stall hızı|Target stall speed
Hedef için kanat alanı|Wing area for target
Mevcut alan için AR 8 açıklığı|Span for aspect ratio 8
Daralma oranı|Taper ratio
Konum|Position
X pozisyonu|X position
Alan|Area
Kuyruk kolu|Tail moment arm
H kuyruk (ikiz fin)|H-tail (twin fins)
Π kuyruk (üst köprü)|Π-tail (top bridge)
Ters V kuyruk|Inverted V-tail
Gövde (özgün) ve denge|Custom fuselage and balance
Gövde ve denge|Fuselage and balance
Gövde uzunluğu|Fuselage length
Gövde genişliği|Fuselage width
Gövde yüksekliği|Fuselage height
CG pozisyonu|CG position
Dikey kuyruk (ikiz, her biri)|Vertical tail (each fin)
V kuyruk (iki eğik yüzey)|V-tail (two inclined surfaces)
Toplam eğik açıklık|Total inclined span
Yatay izdüşüm açıklığı|Horizontal projected span
Eğim açısı|Inclination
Toplam fiziksel alan|Total physical area
Her bir yüzeyin alanı|Area per surface
Yatay etkin alan|Effective horizontal area
Dikey etkin alan|Effective vertical area
Kuyruk bomları (karbon boru, 2 adet)|Tail booms (two carbon tubes)
Uzunluk|Length
Çap|Diameter
Merkezden uzaklık|Distance from centerline
Kontrol yüzeyi alanları|Control surface areas
Brüt referans kanat alanı|Gross reference wing area
Hareketli yüzey hedef alanları|Target control surface areas
Kuyruk hareketli yüzey ölçüleri|Tail control dimensions
Gimbal burnu ve VTX kapağı|Gimbal nose and VTX cover
Kökten başlangıç|Start from root
Yüzey uzunluğu|Surface span
Veter oranı|Chord ratio
Başlangıç ve uzunluk, kuyruk panelinin kökten uca açıklığının yüzdesidir. STL üretiminde montaj ve menteşe payları korunur.|Start and length are percentages of the tail panel span from root to tip. STL generation retains mounting and hinge clearances.
STL’den ölçülen hareketli yüzey alanları|Control surface areas measured from STL
STL önizlemesi hazırlanıyor.|Preparing the STL preview.
STL üretimi tamamlanamadı. Alan ölçülemedi.|STL generation failed. No area was measured.
Ölçülebilen hareketli yüzey bulunamadı.|No measurable control surfaces found.
Aileron, iki kanat toplamı|Aileron, both wings combined
Flap, iki kanat toplamı|Flap, both wings combined
İrtifa dümeni|Elevator
Yön dümeni|Rudder
Yön dümeni, tek dikey fin|Rudder, one fin
V-kuyruk dümeni|Ruddervator
Sol|Left
Sağ|Right
İç parça|Inboard segment
Dış parça|Outboard segment
Tek parça|One piece
Toplam|Total
Flaperon, iki kanat toplamı|Flaperon, both wings
Flaperon alan hedefi|Flaperon area target
Ruddervator (iki yüzey toplam)|Ruddervator, both surfaces
Uygun|Pass
Sınırda|Marginal
Yetersiz|Insufficient
Stall hızı|Stall speed
Tırmanma oranı|Climb rate
Statik marj|Static margin
Havada kalış|Endurance
Sürekli dönüş hızı|Sustained turn rate
Kanat yunuslama momenti|Wing pitching moment
Veter (m)|Chord (m)
Sürekli|Sustained
Anlık|Instantaneous
Gerekli|Required
Mevcut|Available
Hız (m/s)|Speed (m/s)
Dönüş hızı (°/s)|Turn rate (°/s)
Güç (W)|Power (W)
Konvansiyonel kuyrukta dikey veterler yatay kuyruktan alınır.|For a conventional tail, vertical chords follow the horizontal tail.
Kontrol servo yuvaları|Control servo seats
Servo yuvası konumu|Servo seat location
Kapalı|Off
Kanat ve kuyruk|Wing and tail
Burun kapağını göster|Show nose cover
dk|min
`.trim().split('\n').map(line => line.split('|')));

function studioEnglishText(value) {
  const phrase = value.trim().replace(/\s+/g, ' ');
  const english = studioEnglish.get(phrase);
  if (english) return value.replace(/\S[\s\S]*\S|\S/, english);
  const airfoil = phrase.match(/^(NACA .+?) · %(\d+(?:[.,]\d+)?) kalınlık$/);
  if (airfoil) return airfoil[1] + ' · ' + airfoil[2] + '% thickness';
  const ready = phrase.match(/^STL ile aynı detaylı model hazır\. (\d+) baskı parçası\.$/);
  if (ready) return `Print preview ready · ${ready[1]} parts.`;
  const pending = phrase.match(/^STL önizlemesi hazır değil:\s*(.+)$/);
  if (pending) return `Print preview unavailable: ${pending[1]}`;
  const mounts = phrase.match(/^(\d+) bağlantı noktası\. Seçip yakınlaştırabilirsiniz\.$/);
  if (mounts) return `${mounts[1]} mounting points. Select one for a close-up.`;
  return value;
}

function studioLabel(value) {
  return document.documentElement.lang === 'en' && value ? studioEnglishText(value) : value;
}

const localizedAttributes = ['aria-label', 'title', 'placeholder'];
const studioOriginalText = new WeakMap();
const studioOriginalAttributes = new WeakMap();

function translateStudioText(node) {
  const parent = node.parentElement;
  if (!parent || parent.closest('script,style,textarea,[data-keep-language]')) return;
  const old = studioOriginalText.get(node);
  const original = old && node.nodeValue === old.english ? old.original : node.nodeValue;
  const english = studioEnglishText(original);
  studioOriginalText.set(node, {original, english});
  const next = document.documentElement.lang === 'en' ? english : original;
  if (node.nodeValue !== next) node.nodeValue = next;
}

function translateStudioAttributes(element) {
  const old = studioOriginalAttributes.get(element) || {};
  for (const key of localizedAttributes) {
    if (!element.hasAttribute(key)) continue;
    const value = element.getAttribute(key);
    const original = value === old[key]?.english ? old[key].original : value;
    const english = studioEnglishText(original);
    old[key] = {original, english};
    const next = document.documentElement.lang === 'en' ? english : original;
    if (value !== next) element.setAttribute(key, next);
  }
  studioOriginalAttributes.set(element, old);
}

function translateStudioTree(root) {
  if (root.nodeType === Node.TEXT_NODE) {
    translateStudioText(root);
    return;
  }
  if (!(root instanceof Element)) return;
  translateStudioAttributes(root);
  for (const element of root.querySelectorAll('[aria-label],[title],[placeholder]')) {
    translateStudioAttributes(element);
  }
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) translateStudioText(walker.currentNode);
}

let studioLanguageObserver;
function setStudioLanguage(language) {
  document.documentElement.lang = language;
  studioLanguageObserver?.disconnect();
  translateStudioTree(document.documentElement);
  studioLanguageObserver ??= new MutationObserver(records => {
    for (const record of records) {
      if (record.type === 'characterData') translateStudioText(record.target);
      else if (record.type === 'attributes') translateStudioAttributes(record.target);
      else for (const node of record.addedNodes) translateStudioTree(node);
    }
  });
  if (language === 'en') {
    studioLanguageObserver.observe(document.documentElement, {
      subtree:true, childList:true, characterData:true, attributes:true, attributeFilter:localizedAttributes,
    });
  }
}
