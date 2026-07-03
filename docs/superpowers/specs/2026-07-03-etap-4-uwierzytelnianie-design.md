# Etap 4 — Uwierzytelnianie i profil gracza — design doc

Data: 2026-07-03

## Kontekst

Etapy 1–3 (silnik gry, tryb lokalny hot-seat, oprawa wizualna "Electric HUD") są ukończone i zmergowane do `master`. Aplikacja jest w pełni grywalna offline na jednym urządzeniu, bez żadnego backendu.

Etap 4 dodaje uwierzytelnianie (Firebase Auth) i profil gracza (Firestore), jako fundament pod tryb online z Etapów 5–6. **Tryb lokalny (hot-seat) pozostaje w pełni dostępny bez logowania** — logowanie to nowe, boczne wejście do aplikacji, nie zamiana obecnego flow.

## Założenie o środowisku Firebase

Nowy projekt Firebase w konsoli **jeszcze nie istnieje** (nie kontynuujemy `bronx-dice` z pierwowzoru — zgodnie z decyzją z roadmapy). Na czas developmentu i testów:

- Konfiguracja SDK (`apiKey`, `authDomain`, `projectId` itd.) czytana ze zmiennych środowiskowych Vite (`import.meta.env.VITE_FIREBASE_*`), nie hardkodowana w źródle.
- `.env.example` w repo z nazwami zmiennych i pustymi/przykładowymi wartościami; realny `.env.local` gitignorowany.
- Lokalnie (dev + testy) aplikacja łączy się z **Firebase Emulator Suite** (Auth + Firestore), nie z prawdziwą chmurą — nie wymaga założonego projektu ani sieci, żeby developować i testować tę funkcjonalność.
- Podłączenie prawdziwego projektu Firebase (założenie w konsoli, uzupełnienie `.env.local`) to osobny, ręczny krok użytkownika poza zakresem tego etapu — kod nie wymaga zmian, żeby przełączyć się z emulatora na produkcję.

## Architektura

Warstwa serwisowa oddzielona od komponentów React, spójnie z istniejącym podziałem `engine/` (czysta logika) vs `components/` (UI) z Etapów 1–3 — serwisy auth/profilu są testowalne niezależnie od Reacta przez mockowanie Firebase SDK.

```
src/firebase/client.ts         — initializeApp z env config; w trybie dev/test podłącza
                                  connectAuthEmulator / connectFirestoreEmulator
src/services/authService.ts    — signInWithGoogle, signInWithEmail, registerWithEmail,
                                  sendPasswordReset, signOutUser, subscribeToAuthState
src/services/profileService.ts — getProfile(uid), createProfile(uid, data), updateProfile(uid, data)
src/services/authErrors.ts     — mapowanie kodów błędów Firebase Auth na komunikaty PL
src/contexts/AuthContext.tsx   — Provider + hook useAuth() zwracający { user, profile, loading }
src/components/LoginScreen.tsx
src/components/RegisterScreen.tsx
src/components/ForgotPasswordScreen.tsx
src/components/ProfileSetupScreen.tsx  — uzupełnienie nazwy + avatara przy pierwszym logowaniu
src/components/ProfileScreen.tsx       — podgląd/edycja profilu, wylogowanie
```

`AuthContext` subskrybuje `onAuthStateChanged` raz przy starcie aplikacji (w `App.tsx`, opakowując całe drzewo) i wystawia stan przez `useAuth()`. Firebase Auth domyślnie trzyma sesję w `localStorage`, więc odświeżenie strony zachowuje zalogowanie bez dodatkowej pracy po naszej stronie.

Ekrany przełączane lokalnym stanem w `App.tsx`, tak jak dziś `StartScreen` ↔ `GameScreen` — bez wprowadzania routera (biblioteka routingu byłaby niepotrzebnym narzutem dla garstki ekranów bez realnych URL-i, niespójnym z obecnym wzorcem aplikacji).

## Przepływ ekranów

`StartScreen` dostaje przycisk **"Zaloguj się"** obok istniejącego formularza wyboru liczby graczy/nazw trybu lokalnego. Kliknięcie prowadzi do:

1. **Niezalogowany** → `LoginScreen`: formularz e-mail/hasło + przycisk logowania przez Google, linki do `RegisterScreen` i `ForgotPasswordScreen`. Z każdego ekranu auth da się wrócić do `StartScreen`.
2. **Zalogowany, brak dokumentu `users/{uid}` w Firestore** (pierwsze logowanie — świeżo zarejestrowane konto e-mail albo pierwszy w historii Google sign-in) → `ProfileSetupScreen`: pole nazwy wyświetlanej (dla logowania Google wstępnie wypełnione z `displayName` konta Google, edytowalne; dla e-mail/hasło puste) + wybór avatara z gotowego zestawu ikon. Zapis do Firestore przez `createProfile`, potem przejście do `ProfileScreen`.
3. **Zalogowany, profil istnieje** → `ProfileScreen`: nazwa, avatar, e-mail, przycisk edycji (wraca do formularza jak `ProfileSetupScreen`, ale przez `updateProfile`), przycisk "Wyloguj" (`signOutUser`, wraca do `StartScreen`).

`RegisterScreen` zbiera tylko e-mail + hasło (+ potwierdzenie hasła) — nazwę i avatar gracz uzupełnia zawsze przez `ProfileSetupScreen` zaraz po utworzeniu konta, żeby nie duplikować logiki zbierania profilu w dwóch miejscach (rejestracja e-mail vs pierwszy Google sign-in).

`ForgotPasswordScreen`: pole e-mail, wysyła link resetujący (`sendPasswordReset`), pokazuje potwierdzenie wysyłki (bez ujawniania, czy konto o tym e-mailu istnieje — standardowe zachowanie Firebase). Bez wymogu weryfikacji adresu e-mail w MVP (zgodnie z roadmapą).

## Avatar

Gotowy zestaw kilkunastu prostych ikon/emoji zdefiniowany lokalnie w kodzie (np. `src/components/avatarOptions.ts`: lista `{ id: string, emoji: string }`). W Firestore zapisywany tylko `avatarId` (klucz do zestawu), nie URL ani plik — brak potrzeby Firebase Storage w tym etapie. `ProfileSetupScreen`/edycja profilu renderują siatkę do wyboru; wybrany element podświetlony stylem spójnym z motywem "Electric HUD" z Etapu 3.

## Model danych (Firestore)

```
users/{uid}:
  displayName: string
  avatarId: string       // klucz z lokalnego zestawu awatarów, np. "fox"
  email: string
  createdAt: Timestamp
```

Firestore Security Rules dla tej kolekcji: użytkownik może czytać i zapisywać tylko własny dokument (`request.auth.uid == uid`). (Rules dla pokoi gry online to Etap 5 — tu tylko profil.)

## Obsługa błędów

`authErrors.ts` mapuje kody błędów Firebase Auth na komunikaty PL wyświetlane pod formularzem:

| Kod Firebase | Komunikat PL |
|---|---|
| `auth/invalid-email` | Nieprawidłowy adres e-mail. |
| `auth/user-not-found`, `auth/wrong-password`, `auth/invalid-credential` | Nieprawidłowy e-mail lub hasło. |
| `auth/email-already-in-use` | Konto z tym adresem e-mail już istnieje. |
| `auth/weak-password` | Hasło musi mieć co najmniej 6 znaków. |
| `auth/too-many-requests` | Zbyt wiele prób. Spróbuj ponownie za chwilę. |
| `auth/network-request-failed` | Brak połączenia. Sprawdź internet i spróbuj ponownie. |
| (inny/nieznany kod) | Coś poszło nie tak. Spróbuj ponownie. |

`auth/user-not-found` i `auth/wrong-password` mapowane na ten sam ogólny komunikat celowo — nie zdradzamy, czy dany e-mail jest zarejestrowany.

Każdy formularz (`LoginScreen`, `RegisterScreen`, `ForgotPasswordScreen`, `ProfileSetupScreen`) ma lokalny stan `submitting`, który blokuje przycisk submit i pokazuje stan ładowania, żeby uniknąć podwójnego wysłania.

## Testowanie

`firebase/auth` i `firebase/firestore` mockowane przez `vi.mock` w testach jednostkowych — żadnych realnych wywołań sieciowych ani zależności od Emulator Suite w `npm test` (spójne z obecnym podejściem: silnik gry testowany bez UI, komponenty testowane z gotowymi propsami/mockami zamiast prawdziwego stanu gry).

- `authService`/`profileService`: testy jednostkowe z zamockowanym Firebase SDK — sprawdzają, że odpowiednie funkcje SDK są wołane z odpowiednimi argumentami i że błędy SDK są poprawnie przekazywane dalej.
- `authErrors`: testy jednostkowe czystej funkcji mapującej kod → komunikat.
- Ekrany (`LoginScreen` itd.): testy komponentowe z zamockowanym `useAuth()`/`authService` — bez owijania w prawdziwy `AuthContext`.
- `AuthContext`/`useAuth`: test integracyjny z zamockowanym `subscribeToAuthState`, sprawdzający że stan `user`/`profile`/`loading` aktualizuje się poprawnie.

Emulator Suite pozostaje dostępny do ręcznego testowania end-to-end (`npm run dev` + `firebase emulators:start`), ale nie jest częścią automatycznego `npm test`.

## Zakres i granice

**W zakresie Etapu 4:**
- Konfiguracja Firebase SDK przez zmienne środowiskowe + Emulator Suite do dev/testów.
- Firebase Auth: Google + e-mail/hasło (rejestracja, logowanie, reset hasła).
- Ekrany: `LoginScreen`, `RegisterScreen`, `ForgotPasswordScreen`, `ProfileSetupScreen`, `ProfileScreen`.
- Profil gracza w Firestore (`users/{uid}`: nazwa + avatar z gotowego zestawu ikon + e-mail).
- Wejście "Zaloguj się" na `StartScreen`, wylogowanie z `ProfileScreen`.
- Utrzymanie sesji po odświeżeniu (domyślne zachowanie Firebase Auth).
- Firestore Security Rules dla kolekcji `users`.

**Poza zakresem Etapu 4:**
- Jakiekolwiek wiązanie trybu online/rozgrywki z kontem — to Etap 5 (backend pokoi gry) i Etap 6 (UI lobby). Zalogowanie w tym etapie nie odblokowuje żadnego nowego trybu gry, tylko profil.
- Upload własnego zdjęcia jako avatar / Firebase Storage.
- Weryfikacja adresu e-mail.
- Statystyki gracza (Etap 7).
- Założenie prawdziwego projektu Firebase w konsoli i deploy (Etap 8) — ten etap zostawia to jako ręczny krok do wykonania później, bez zmian w kodzie.

## Kolejne kroki

Po zatwierdzeniu tego dokumentu: szczegółowy plan implementacyjny (`writing-plans`) dla Etapu 4.
