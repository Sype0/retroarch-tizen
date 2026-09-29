# RetroArch for Tizen

Samsung Tizen Smart TV'ler için RetroArch. [libretro web player](https://web.libretro.com/)
(RetroArch'ın WebAssembly derlemesi) üzerine TV'ye özel bir katman ekler:

- Kumanda ile gezilen başlatıcı (sistem seç → ROM seç → oyna)
- Kumanda tuşlarının RetroArch tuşlarına çevrilmesi, USB/Bluetooth oyun kolu desteği
- ROM'ları **USB bellekten** (yalnızca .wgt) veya **ağ klasöründen** (HTTP) yükleme
- Hafif RGUI menüsü ve TV için ayarlanmış varsayılanlar
- Kayıtlar/ayarlar TV'de kalıcı (IndexedDB)

## Kurulum

### A) TizenBrew modülü (en kolay)

TizenBrew açıkken modül yöneticisine şunu ekle:

```
gh/Sype0/retroarch-tizen
```

### B) .wgt uygulaması (USB desteği için)

TizenBrew Installer ile **GitHub reposundan kur** seçeneğine `Sype0/retroarch-tizen` yaz
veya [Releases](https://github.com/Sype0/retroarch-tizen/releases) sayfasındaki `RetroArch.wgt`
dosyasını USB'den kur. Tizen 7+ TV'lerde installer paketi kendi sertifikanla yeniden imzalar.

Uygulama kabuğu TV'de çalışır; emülatör çekirdekleri (wasm) ilk açılışta
<https://sype0.github.io/retroarch-tizen/> adresinden indirilir, bu yüzden internet gerekir.

## ROM yükleme

**Ağ klasörü:** ROM'ların olduğu bilgisayarda veya telefonda (Termux dahil):

```sh
python3 tools/rom-server.py /ROM/klasörü
```

Ekrana yazan adresi (ör. `http://192.168.1.20:8000/`) TV'de *Ağ klasöründen ROM seç* ekranına gir.
Adres hatırlanır.

**USB:** ROM'ları USB belleğe kopyala, TV'ye tak, *USB bellekten ROM seç*.

## Kumanda tuşları (oyun içinde)

| Tuş | İşlev |
| --- | --- |
| Yön tuşları | D-Pad |
| OK | A (menüde onay) |
| Geri | B (menüde geri) |
| Kırmızı / 0 | RetroArch menüsü |
| Yeşil / Sarı | Start / Select |
| Mavi / 2 | X / Y |
| 1 / 3 | L / R |
| CH+ / CH− | Durum kaydet / yükle |
| Oynat/Duraklat | Duraklat |

Oyundan çıkmak için menüden **Quit RetroArch** seç.

## Sistemler

NES, SNES, Game Boy / Color / Advance, Sega Master System / Game Gear / Mega Drive / CD / 32X,
PlayStation, PC Engine, Arcade (FBA 2012 CPS-1/2/Neo Geo, MAME 2003-Plus, FinalBurn Neo),
Atari 2600 / Lynx, Neo Geo Pocket, WonderSwan, Virtual Boy, Doom. Liste: [`tools/cores.txt`](tools/cores.txt).

## Uyumluluk

Libretro'nun web derlemesi Chromium 85+ gerektirir: **Tizen 6.5 ve üzeri (2022 ve sonrası modeller)**.
Daha eski TV'lerde başlatıcı açılır ama çekirdekler hata verir (hata ekranın altında gösterilir).
PlayStation ve büyük arcade oyunları TV'nin işlemcisine göre yavaş olabilir; ROM'lar belleğe
yüklendiği için çok büyük CD imajları (yüzlerce MB) sorun çıkarabilir.

## Nasıl çalışır / derleme

`.github/workflows/build.yml`:

1. `tools/cores.txt` içindeki çekirdekleri web.libretro.com'dan indirir, ES modüllerini klasik
   script'e çevirir (wgt içinde `file://` altında da yüklenebilsin diye).
2. RetroArch'ın 133 MB'lık asset paketini gerekli kısımlarına (core info, autoconfig, RGUI, shader) indirger.
3. `app/` + çekirdekler + paketi GitHub Pages'e yayınlar.
4. [tizen.js](https://github.com/reisxd/tizen.js) ile imzalı `RetroArch.wgt` üretir; `v*` etiketinde Release oluşturur.

İmzalama için repo secret'ları: `TIZEN_AUTHOR_P12` (base64 PKCS#12) ve `TIZEN_AUTHOR_PASSWORD`.

Yerelde denemek için `app/` klasörünü herhangi bir web sunucusuyla aç; `?base=https://sype0.github.io/retroarch-tizen/`
parametresi çekirdekleri Pages'ten çeker.

## Lisans

GPLv3. RetroArch ve libretro çekirdekleri kendi lisanslarına tabidir
([RetroArch](https://github.com/libretro/RetroArch), [libretro](https://www.libretro.com/)).
Bu proje libretro ekibiyle bağlantılı değildir. ROM dahil değildir; yalnızca sahip olduğun oyunları kullan.
