import { createContext, useContext, useEffect, useState } from 'react';
import { api } from '../api.js';

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(!!localStorage.getItem('erp-token'));

  useEffect(() => {
    if (!localStorage.getItem('erp-token')) return;
    api('/auth/me')
      .then((d) => setUser(d.user))
      .catch(() => localStorage.removeItem('erp-token'))
      .finally(() => setLoading(false));
  }, []);

  async function login(email, password) {
    const d = await api('/auth/login', { method: 'POST', body: { email, password } });
    localStorage.setItem('erp-token', d.token);
    setUser(d.user);
  }
  function updateToken(token) {
    localStorage.setItem('erp-token', token);
  }
  function markPasswordChanged() {
    setUser((u) => (u ? { ...u, mustChangePassword: false } : u));
  }
  function logout() {
    localStorage.removeItem('erp-token');
    setUser(null);
  }

  return <AuthContext.Provider value={{ user, loading, login, logout, updateToken, markPasswordChanged }}>{children}</AuthContext.Provider>;
}
