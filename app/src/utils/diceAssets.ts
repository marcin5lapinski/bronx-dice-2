import type { DiceValue } from '@bronx-dice/game-engine';

const DICE_VALUES: DiceValue[] = [1, 2, 3, 4, 5, 6];

export function diceFaceSrc(value: DiceValue, held: boolean): string {
  return `/dice/die-${held ? 'muted' : 'glow'}-${value}.png`;
}

// Warms the browser's HTTP cache for every glow/muted face up front, so a
// die landing on a value/held-state combination for the first time mid-game
// never triggers its own network request.
export function preloadDiceFaces(): void {
  for (const value of DICE_VALUES) {
    for (const held of [false, true]) {
      new Image().src = diceFaceSrc(value, held);
    }
  }
}
