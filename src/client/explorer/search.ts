/**
 * File-name search view & loader — explorer domain.
 * @module dsh-solution-explorer/client/explorer/search
 */




import type { AppState } from "../state/store.ts"
import { commands } from '../commands.ts'

export async function searchFiles(query: string, { state, render }: { state: AppState; render: () => void }) {

					state.search.searchQuery = query;

					if (!query.trim()) {

						state.search.searching = false;

						state.search.searchResults = [];

						render();

						return;

					}

					state.search.searching = true;

					render();

					try {

						const result = await (await fetch(`/solution-explorer/search?root=${encodeURIComponent(state.root)}&q=${encodeURIComponent(query)}`)).json();

						if (state.search.searchQuery !== query) return;

						if (result.ok) state.search.searchResults = result.value;

						render();

					} catch {

						render();

					}

				}

export function registerSearchCommands(deps: { state: AppState; render: () => void }): () => void {
  const { state, render } = deps

  commands.clearSearch = () => {
    state.search.searchQuery = "";
    state.search.searching = false;
    state.search.searchResults = [];
    render();
  };

  commands.search = (query) => {
    // Controlled input: the query must land in React props synchronously,
    // otherwise React restores (wipes) the typed character. Only the
    // network fetch stays debounced.
    state.search.searchQuery = query;
    if (!query.trim()) {
      state.search.searching = false;
      state.search.searchResults = [];
      render();
      return;
    }
    state.search.searching = true;
    render();
    if (state.search.searchTimer) clearTimeout(state.search.searchTimer);
    state.search.searchTimer = setTimeout(() => searchFiles(query, deps), 300);
  };

  return () => {
    delete commands.clearSearch;
    delete commands.search;
  };
}
