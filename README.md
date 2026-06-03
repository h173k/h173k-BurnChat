# h173k Burn Chat

PWA, w której użytkownicy „palą" tokeny **$H173k**, wysyłając je na adres spalania
wraz z wiadomością zapisaną w polu memo transakcji. Wszystkie spalenia z memo
pojawiają się na żywo jako czat na ekranie głównym.

Aplikacja powstała przez ponowne wykorzystanie technologii i wiernie odwzorowuje
wygląd dostarczonego portfela referencyjnego (`h173k_Wallet`): czarne tło,
animowana smuga światła w tle, „szklane" karty, font Inter, te same kolory
i zaokrąglenia.

---

## Uruchomienie

```bash
npm install
npm run dev      # tryb deweloperski (http://localhost:5173)
npm run build    # produkcyjny build do ./dist
npm run preview  # podgląd builda produkcyjnego
```

Wymagany Node 18+.

> **Ważne — RPC.** Domyślnie aplikacja używa publicznego endpointu
> `https://api.mainnet-beta.solana.com`, który jest mocno limitowany i nie
> nadaje się do ciągłego nasłuchu. Wejdź w **Ustawienia → RPC** i wpisz własny
> endpoint (np. Helius / QuickNode / Triton). Celowo nie zaszyłem tu klucza
> z portfela referencyjnego.

---

## Kluczowe parametry (src/constants.js)

| Co | Wartość |
|---|---|
| Token mint ($H173k) | `173AvoJNQoWsaR1wdYTMNLUqZc1b7d4SzB2ZZRZVyz3` |
| Adres spalania (domyślny) | `h173kBurn1111111111111111111111111111111111` |
| Pula h173k–SOL (swap) | `8A7r3ZT7nXjtghKKnmVhrwnApJHG4tpvBF9BDCBmHWqr` |
| Pula h173k–USDT (cena) | `J9ED7D3pR7Uw5W6Y52p1Mq3Gfkmumg8fHRvLEiHLL2S7` |
| Program memo | `MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr` |
| Limit memo | 500 bajtów |
| Limit widocznego tekstu | 260 znaków |
| Decimals | 9 |

---

## Mapa wymagań → kod

1. **PWA + nasłuch wpłat na adres spalania, tylko mint $H173k, tylko z memo** —
   `useBurnChat.js`: wyliczam ATA adresu spalania dla mintu h173k, pobieram
   sygnatury i parsuję transakcje; pomijam transakcje bez memo i bez przychodzącego h173k.
2. **Zmiana obserwowanego adresu** — Ustawienia (`getBurnAddress/saveBurnAddress`),
   z przyciskiem przywrócenia domyślnego.
3. **Wyświetlanie memo na ekranie głównym** — `ChatView` / `MessageRow`.
4. **Pseudonim** — Ustawienia (`nickname`).
5. **Limit 500 bajtów** — `truncateToBytes` + budżet bajtowy w `buildMemo`.
6. **Limit 260 znaków** — `MAX_TEXT_CHARS`, twarde ograniczenie w polu tekstowym.
7. **Emoji** — liczone po code-pointach (bez rozbijania par surogatów).
8. **Kto ile spalił + filtr min. kwoty** — `MessageRow` pokazuje kwotę; filtr
   `minBurnFilter` w Ustawieniach.
9. **Ticker h173k + cena z puli USDT** — `usePrice.js` (GeckoTerminal), `PriceTag`.
10. **Sortowanie najnowsze/największe, trwałe** — `sort` w Ustawieniach,
    `useMemo` sortuje cały zbiór wiadomości.
11. **Limit liczby pobieranych wiadomości** — `fetchLimit` (tylko start).
12. **Auto-dolewka SOL + ustawienie RPC** — `withAutoSOL` z `useSwap.js`;
    Ustawienia RPC.
13. **Animacja przy dużych spaleniach** — `BurnFx` (próg `fxThreshold`).
14. **Kwoty jako h173k lub USDT** — `displayUnit`, przeliczane po cenie z puli.
15. **Seed phrase (nie „connect")** — onboarding tworzy/importuje 12 słów,
    szyfrowane PIN-em (`crypto/wallet.js`, `crypto/auth.js`).
16. **Płatność h173k lub SOL (automatycznie)** — jedno pole kwoty (w h173k).
    Jeśli masz dość h173k → palone bezpośrednio. Jeśli nie — aplikacja sama
    dolicza brakującą ilość, zamieniając SOL na h173k na puli h173k–SOL
    (`burn()` w `useChatWallet.js`, odwrotna wycena `quoteSOLForH173K` w
    `useSwap.js`). Żadnych przycisków wyboru „czym zapłacić".
17. **Pseudonim w memo, oddzielony od wiadomości** — format `nick` + `U+001F` +
    `treść`; parser dzieli na pierwszym separatorze, UI pokazuje osobno.
18. **Limit tylko na starcie; live bez spamu API; filtry tylko ukrywają** —
    polling co 12 s z `until: lastSig` (tylko nowe sygnatury); filtry działają
    na widoku, nie na pobieraniu.
19. **Brak SOL i h173k → prośba o wpłatę** — `DepositPrompt` (QR + adres),
    którą można zamknąć (X / „I'll do it later"); nie pokazuje się, gdy bilans
    nie został pobrany z powodu błędu RPC.
20. **Sanityzacja, brak wykonania JS (XSS)** — `sanitizeText` usuwa znaki
    kontrolne i spoofujące; render wyłącznie jako tekst (brak
    `dangerouslySetInnerHTML`).
21. **Nazwa aplikacji** — „h173k Burn Chat" (manifest, vite.config, index.html).

---

## Bezpieczeństwo wiadomości

Memo ma postać `pseudonim` + znak `U+001F` (Unit Separator, 1 bajt, niemożliwy
do wpisania z klawiatury) + `treść`. Parser rozdziela na pierwszym `U+001F`,
**potem** sanityzuje każdą część osobno (usuwa znaki kontrolne, zero-width,
RLO itp.). Wiadomości renderowane są jako węzły tekstowe Reacta, więc
ewentualny kod HTML/JS pozostaje nieszkodliwym tekstem.

## Uwagi

- W tym środowisku nie było dostępu do mainnetu Solany, więc logika została
  zweryfikowana testami jednostkowymi (liczenie znaków/bajtów, emoji,
  sanityzacja, format memo), a nie nasłuchem na żywo.
