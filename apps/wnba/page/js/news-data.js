import { session } from "./session.js";

// The Worker keeps the week's news stories in the store, and pushes every change to the page.

const NEWS_PATH = "news/stories";

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
