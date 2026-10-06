// The league and ESPN spell a name alike but for the odd accent or punctuation, so a player is
// matched across them by her name's letters alone.

/** @param {{ firstName: string, lastName: string }} player */
export const normalizeName = ({ firstName, lastName }) =>
  `${firstName} ${lastName}`
    .normalize("NFD")
    .replace(/[^a-z]/gi, "")
    .toLowerCase();
