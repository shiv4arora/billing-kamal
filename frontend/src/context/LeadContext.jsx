import { createContext, useContext, useState, useEffect } from 'react';
import { api } from '../hooks/useApi';
import { useAuth } from './AuthContext';

const Ctx = createContext();

export function LeadProvider({ children }) {
  const { currentUser } = useAuth();
  const [leads, setLeads] = useState([]);

  useEffect(() => {
    if (!currentUser) return;
    api('/leads').then(setLeads).catch(console.error);
  }, [currentUser]);

  const addLead = async (data) => {
    const created = await api('/leads', { method: 'POST', body: data });
    setLeads(p => [created, ...p]);
    return created;
  };

  const updateLead = async (id, data) => {
    const updated = await api(`/leads/${id}`, { method: 'PUT', body: data });
    setLeads(p => p.map(x => x.id === id ? updated : x));
    return updated;
  };

  const removeLead = async (id) => {
    await api(`/leads/${id}`, { method: 'DELETE' });
    setLeads(p => p.filter(x => x.id !== id));
  };

  const getLead = (id) => leads.find(x => x.id === id);

  return (
    <Ctx.Provider value={{ leads, addLead, updateLead, removeLead, getLead }}>
      {children}
    </Ctx.Provider>
  );
}

export const useLeads = () => useContext(Ctx);
