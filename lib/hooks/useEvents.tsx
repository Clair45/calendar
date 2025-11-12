import { useEffect, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { EventRecord, getAllEvents, subscribe, addEvent as svcAdd, deleteEvent as svcDelete, updateEvent as svcUpdate } from '../services/events';

export function useEvents() {
  const [items, setItems] = useState<EventRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    getAllEvents().then((list) => { if (mounted) { setItems(list); setLoading(false); }});
    const unsub = subscribe((list) => { setItems(list); });
    return () => { mounted = false; unsub(); };
  }, []);

  const create = async (payload: Omit<EventRecord, 'id'>) => {
    const ev = { ...payload, id: uuidv4() };
    await svcAdd(ev);
    return ev;
  };

  const update = async (id: string, patch: Partial<EventRecord>) => {
    return await svcUpdate(id, patch);
  };

  const remove = async (id: string) => {
    return await svcDelete(id);
  };

  return { items, loading, create, update, remove };
}