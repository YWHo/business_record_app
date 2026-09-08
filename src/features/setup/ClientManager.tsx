import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { apiRequest } from '../auth/AuthContext';

interface Client {
  id: string;
  name: string;
  active: boolean;
  notes: string | null;
}

export function ClientManager({ canManage }: { canManage: boolean }) {
  const [clients, setClients] = useState<Client[]>([]);
  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');
  const [edit, setEdit] = useState<Client | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const load = useCallback(async () => {
    const result = await apiRequest<{ clients: Client[] }>('/api/clients');
    setClients(result.clients);
  }, []);
  useEffect(() => {
    // Loading remote state is the synchronization performed by this effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load().catch((caught: unknown) =>
      setError(
        caught instanceof Error ? caught.message : 'Unable to load clients.',
      ),
    );
  }, [load]);
  async function create(event: FormEvent) {
    event.preventDefault();
    setError('');
    try {
      await apiRequest('/api/clients', {
        method: 'POST',
        body: JSON.stringify({ name, notes }),
      });
      setName('');
      setNotes('');
      setMessage('Client added.');
      await load();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'Unable to add client.',
      );
    }
  }
  async function update(client: Client, changes: Partial<Client>) {
    setError('');
    try {
      await apiRequest('/api/clients', {
        method: 'PATCH',
        body: JSON.stringify({ id: client.id, ...changes }),
      });
      setEdit(null);
      setMessage('Client updated.');
      await load();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'Unable to update client.',
      );
    }
  }
  return (
    <section
      className="panel reference-panel"
      aria-labelledby="clients-heading"
    >
      <div className="section-heading">
        <div>
          <h2 id="clients-heading">Clients</h2>
          <p>Reusable invoice recipients—not a customer relationship system.</p>
        </div>
        <span className="count-badge">{clients.length}</span>
      </div>
      {canManage ? (
        <form
          className="reference-form"
          onSubmit={(event) => void create(event)}
        >
          <h3>Add client</h3>
          <label>
            Name
            <input
              required
              maxLength={200}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <label>
            Notes (optional)
            <textarea
              maxLength={1000}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </label>
          <button>Add client</button>
        </form>
      ) : null}
      {message ? (
        <p role="status" className="notice success">
          {message}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="notice error">
          {error}
        </p>
      ) : null}
      <div className="record-list">
        {clients.map((client) => (
          <article className="reference-card" key={client.id}>
            {edit?.id === client.id ? (
              <form
                className="reference-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  void update(client, { name: edit.name, notes: edit.notes });
                }}
              >
                <label>
                  Name
                  <input
                    required
                    maxLength={200}
                    value={edit.name}
                    onChange={(event) =>
                      setEdit({ ...edit, name: event.target.value })
                    }
                  />
                </label>
                <label>
                  Notes
                  <textarea
                    maxLength={1000}
                    value={edit.notes ?? ''}
                    onChange={(event) =>
                      setEdit({ ...edit, notes: event.target.value })
                    }
                  />
                </label>
                <div className="button-row">
                  <button>Save</button>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => setEdit(null)}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <>
                <div className="section-heading">
                  <div>
                    <h3>{client.name}</h3>
                    <span
                      className={`status-badge ${client.active ? 'active' : 'inactive'}`}
                    >
                      {client.active ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                </div>
                {client.notes ? <p>{client.notes}</p> : null}
                {canManage ? (
                  <div className="button-row">
                    <button
                      className="secondary-button"
                      onClick={() => setEdit(client)}
                    >
                      Edit
                    </button>
                    <button
                      className={
                        client.active ? 'danger-button' : 'secondary-button'
                      }
                      onClick={() =>
                        void update(client, { active: !client.active })
                      }
                    >
                      {client.active ? 'Deactivate' : 'Reactivate'}
                    </button>
                  </div>
                ) : null}
              </>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
