import { html } from "#shared/html.js";

/**
 * A button around a player's name that opens his sheet.
 * @param {{ id: number, name: string, number?: string }} player
 * @param {string} club
 */
export const renderPlayerButton = (player, club) =>
  html`<button type="button" class="player-open box-name" data-player="${String(player.id)}" data-player-club="${club}" data-player-name="${player.name}" data-player-number="${player.number ?? ""}">${player.name}</button>`;
