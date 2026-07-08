import { useEffect } from 'react';

interface HowToPlayModalProps {
  onClose: () => void;
}

function HowToPlayModal({ onClose }: HowToPlayModalProps) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div className="how-to-play-overlay">
      <div
        className="how-to-play-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="how-to-play-title"
      >
        <h2 id="how-to-play-title">Jak grać?</h2>

        <h3>Cel gry</h3>
        <p>
          Bronx Dice to gra w kości podobna do Yahtzee, z własnymi zasadami
          domowymi. W każdej turze rzucasz kośćmi i próbujesz zapełnić jak
          najlepiej tabelę wyników — wygrywa gracz z najwyższą sumą punktów po
          zapełnieniu całej tabeli.
        </p>

        <h3>Przebieg tury</h3>
        <p>
          Masz do 3 rzutów wszystkimi 5 kośćmi. Po każdym rzucie możesz
          zdecydować: rzucić ponownie (tylko kośćmi, które nie są zatrzymane)
          albo zakończyć turę, wpisując wynik w jedną z wolnych kategorii w
          tabeli.
        </p>

        <h3>Trzymanie kości (holdowanie)</h3>
        <p>
          Kliknięcie kości zatrzymuje ją ("hold") — przy kolejnym rzucie
          zatrzymane kości zachowują swoją wartość, rzucane są tylko te
          odznaczone. Dzięki temu możesz np. zatrzymać parę szóstek licząc na
          czwórkę tej samej wartości, albo zatrzymać cztery kolejne wartości,
          dobijając piąty rzut do strita. Trzymanie to główne narzędzie
          strategiczne — pozwala zachować dobre kości i ryzykować tylko
          resztą, zamiast rzucać wszystkim od nowa.
        </p>

        <h3>Sekcja górna</h3>
        <p>
          Jedynki, Dwójki, Trójki, Czwórki, Piątki, Szóstki. Wynik = liczba
          kości danej wartości × wartość ścianki (np. trzy szóstki w
          kategorii "Szóstki" = 18 pkt). Jeśli suma całej sekcji górnej
          osiągnie 63 punkty lub więcej, dostajesz premię +50 punktów.
        </p>

        <h3>Sekcja dolna</h3>
        <p>Odblokowuje się dopiero, gdy cała sekcja górna jest zapełniona:</p>
        <ul>
          <li>Para — dwie takie same kości: wartość × 2</li>
          <li>2× Para — dwie różne pary: suma wartości obu par × 2</li>
          <li>3X (trójka) — trzy takie same: wartość × 3</li>
          <li>4X (czwórka) — cztery takie same: wartość × 4</li>
          <li>Mały strit — kości 1-2-3-4-5: zawsze 15 pkt</li>
          <li>Duży strit — kości 2-3-4-5-6: zawsze 20 pkt</li>
          <li>Full — trójka + para (wszystkie 5 kości): suma wszystkich kości</li>
          <li>Szansa — dowolny układ: suma wszystkich kości</li>
          <li>
            5X (Generał/Yahtzee) — wszystkie 5 kości takie same: suma kości +
            premia 50 punktów
          </li>
        </ul>

        <h3>Zasada podwajania</h3>
        <p>
          Jeśli zdecydujesz się wpisać wynik w kategorię z sekcji dolnej od
          razu po pierwszym rzucie (czyli zostały jeszcze 2 rzuty do
          wykorzystania), Twój wynik w tej kategorii zostaje podwojony. To
          nagroda za szybkie, śmiałe decyzje zamiast zawsze dobijania kości do
          ideału. (Premia +50 za 5X nie jest podwajana — dotyczy to tylko
          surowego wyniku bazowego.)
        </p>

        <button type="button" onClick={onClose}>
          Zamknij
        </button>
      </div>
    </div>
  );
}

export default HowToPlayModal;
