import { useCallback, useEffect, useState } from 'react';
import { api } from './api.js';

export function useFetch(path) {
  const [state, setState] = useState({ data: null, error: '', loading: true });
  const load = useCallback(() => {
    if (!path) {
      setState({ data: null, error: '', loading: false });
      return;
    }
    setState((s) => ({ ...s, loading: true, error: '' }));
    api(path)
      .then((data) => setState({ data, error: '', loading: false }))
      .catch((e) => setState({ data: null, error: e.message, loading: false }));
  }, [path]);
  useEffect(() => {
    load();
  }, [load]);
  return { ...state, reload: load };
}
