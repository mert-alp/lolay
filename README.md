# LoLo

Kişisel kullanım için League of Legends client yardımcısı (Electron). Blitz / OP.GG benzeri, oyun içi overlay olmadan; build verisini varsayılan olarak **Lolalytics**'ten çeker.

## Özellikler

- **Kabul ekranı** – maç bulununca pencere öne gelir; kuyruk adı ve geri sayımla Kabul (Enter) / Reddet (Esc), isteğe bağlı gecikmeli otomatik kabul. Client'tan kabul edilirse uygulamadaki ekran da kapanır.
- **Draft ekranı** (champ select'te otomatik açılır)
  - Ban fazında en çok banladığın şampiyonlar (uygulama banlarını kaydeder) ve lane'de en çok banlananlar
  - Öneriler: kendi şampiyonların (rakip laner'a karşı WR ile), rakip laner'a karşı counter pick'ler, kişiselleştirilmiş öneriler, takip listesi, en çok oynanan / banlanan şampiyonlar
  - Tüm şampiyonlar seçicisi: arama + lane filtresi, programdan **hover / kilitle / banla**
  - Build sekmesi: rün sayfaları (en çok seçilen, en yüksek WR, keystone varyantları, "Ekko vs Vi" eşleşme sayfaları (şampiyon ikonlarıyla), pro oyuncu sayfaları), doğrudan tıklanarak düzenlenen rünler, D ⇄ F spell kontrolü, eşyalar, skill sırası
  - Takım kartları (rank, WR, mastery, son maçlar, Autofill / OTP etiketleri), takım hasar dağılımı, banlar
  - Seçimler champ select'te otomatik client'a uygulanır; Flash tuşu ve şampiyon/lane bazında rün & spell tercihleri hatırlanır
- **Şampiyon sayfası** – build, rün / eşya / spell açıklamaları (LoL tooltip'leri), counter'lar, lane ve rank filtresi
- **Meta** – lane bazında tier listesi, yükselenler / düşenler, ★ takip listesi
- **Maç** – canlı maç oyuncu kartları
- **Profil** – rank kartları, son maç istatistikleri, karşılaşma geçmişi + maç detayı, çok bölgeli oyuncu arama (Ctrl+K)
- TR / EN arayüz, rank otomatik algılama, sistem tepsisinde çalışma, 380 px'den geniş ekranlara responsive tasarım

## Kurulum

[Releases](../../releases) sayfasından `LoLo-Setup-x.y.z.exe` dosyasını indirip çalıştır.
Windows "bilinmeyen yayıncı" uyarısı verirse **Ek bilgi → Yine de çalıştır** (uygulama imzasız).
League client'ı aç, LoLo otomatik bağlanır. Ek ayar veya anahtar gerekmez.

- ✕ butonu uygulamayı sistem tepsisine gönderir; çıkmak için tepsi ikonu → **Çıkış**.
- Hata kaydı: `%APPDATA%\lolay\lolay.log`

## Veri kaynakları

| Veri | Kaynak |
|---|---|
| Build, rün, eşya, skill, counter, tier listesi | Lolalytics (varsayılan) · OP.GG · U.GG · METAsrc – Ayarlar'dan seçilir |
| Statik veri ve ikonlar | Riot Data Dragon, CommunityDragon |
| Profil, arama, maç geçmişi | Blitz → OP.GG (yedek) |
| Pro oyuncu rün sayfaları | Blitz ProBuilds |
| Champ select, rank, aktarım | League client (LCU, yerel) |

Riot Games API istemcisi kodda mevcut ama **kapalı** (`src/main/riotService.ts` → `RIOT_ENABLED`): kişisel anahtar dağıtılan bir uygulamaya gömülemez ve ara sunucu yok.

Üçüncü parti sitelerin verileri resmi olmayan uç noktalardan okunur; kişisel kullanım içindir ve siteler değiştiğinde kırılabilir. LoLo, Riot Games ile bağlantılı değildir.

## Geliştirme

Gereksinim: Node.js 22+

```bash
npm install
npm run dev        # geliştirme
npm test           # node:test birim testleri
npm run typecheck
npm run dist       # dist/ altına Setup + portable exe
```

Yapı: `src/main` (Electron ana süreç: LCU, veri sağlayıcıları, aktarım), `src/preload`, `src/renderer` (React + Tailwind arayüz), `src/shared` (ortak tipler ve saf yardımcılar), `test` (testler ve fixture'lar).
