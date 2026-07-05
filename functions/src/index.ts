// Cloud Functions entry point — each task in
// docs/superpowers/plans/2026-07-04-etap-5-backend-online.md adds one
// export here as it implements the corresponding Cloud Function.
export { createRoom } from './rooms/createRoom';
export { joinRoom } from './rooms/joinRoom';
export { startGame } from './rooms/startGame';
export { rollDice } from './rooms/rollDice';
export { toggleHeldDie } from './rooms/toggleHeldDie';
export { scoreCategory } from './rooms/scoreCategory';
export { leaveRoom } from './rooms/leaveRoom';
export { setReady } from './rooms/setReady';
export { handleTurnTimeout } from './rooms/handleTurnTimeout';
export { heartbeat } from './rooms/heartbeat';
export { removeInactivePlayers } from './rooms/removeInactivePlayers';
export { returnToLobby } from './rooms/returnToLobby';
