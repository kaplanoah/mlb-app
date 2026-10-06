import { html } from "#shared/html.js";

/** @typedef {import("#shared/html.js").Markup} Markup */

/**
 * A button around a player's name that opens her sheet, which her name names.
 * @param {{ id: string | number, team: string, firstName: string, lastName: string }} player
 * @param {Markup | string} content
 */
export const renderPlayerButton = (player, content) =>
  html`<button type="button" class="player-open" data-player="${String(player.id)}" data-player-team="${player.team}" data-player-name="${player.firstName} ${player.lastName}">${content}</button>`;
