import { session } from "./session.js";

// The Worker keeps the week's news topics in the store, and pushes every change to the page.

const NEWS_PATH = "news/topics";

/** @param {() => void} onChange */
export function watchNews(onChange) {
  session.db.doc(NEWS_PATH).onSnapshot(
    (snapshot) => {
      session.news = snapshot.exists ? snapshot.data() : null;
      onChange();
    },
    () => {},
  );
}
