import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { apiRequest } from '../auth/AuthContext';
import { StatusBadge } from '../../components/StatusBadge';

interface Category {
  id: string;
  name: string;
  active: boolean;
  systemKey: string | null;
}

export function CategoryManager({ canManage }: { canManage: boolean }) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [name, setName] = useState('');
  const [edit, setEdit] = useState<Category | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const load = useCallback(async () => {
    const result = await apiRequest<{ categories: Category[] }>(
      '/api/expense-categories',
    );
    setCategories(result.categories);
  }, []);
  useEffect(() => {
    // Loading remote state is the synchronization performed by this effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load().catch((caught: unknown) =>
      setError(
        caught instanceof Error ? caught.message : 'Unable to load categories.',
      ),
    );
  }, [load]);
  async function create(event: FormEvent) {
    event.preventDefault();
    setError('');
    try {
      await apiRequest('/api/expense-categories', {
        method: 'POST',
        body: JSON.stringify({ name }),
      });
      setName('');
      setMessage('Expense category added.');
      await load();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'Unable to add category.',
      );
    }
  }
  async function update(
    category: Category,
    changes: { name?: string; active?: boolean },
  ) {
    setError('');
    try {
      await apiRequest('/api/expense-categories', {
        method: 'PATCH',
        body: JSON.stringify({ id: category.id, ...changes }),
      });
      setEdit(null);
      setMessage('Expense category updated.');
      await load();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'Unable to update category.',
      );
    }
  }
  return (
    <section
      className="panel reference-panel"
      aria-labelledby="categories-heading"
    >
      <div className="section-heading">
        <div>
          <h2 id="categories-heading">Expense categories</h2>
          <p>Configurable classifications for current and future expenses.</p>
        </div>
        <span className="count-badge">{categories.length}</span>
      </div>
      {canManage ? (
        <form
          className="reference-form"
          onSubmit={(event) => void create(event)}
        >
          <h3>Add category</h3>
          <label>
            Name
            <input
              required
              maxLength={100}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <button>Add category</button>
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
        {categories.map((category) => (
          <article className="reference-card" key={category.id}>
            {edit?.id === category.id ? (
              <form
                className="reference-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  void update(category, { name: edit.name });
                }}
              >
                <label>
                  Name
                  <input
                    required
                    maxLength={100}
                    value={edit.name}
                    onChange={(event) =>
                      setEdit({ ...edit, name: event.target.value })
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
                    <h3>{category.name}</h3>
                    <StatusBadge
                      status={category.active ? 'ACTIVE' : 'INACTIVE'}
                    />
                  </div>
                  {category.systemKey ? (
                    <small>Built-in · {category.systemKey}</small>
                  ) : (
                    <small>Custom</small>
                  )}
                </div>
                {canManage ? (
                  <div className="button-row">
                    <button
                      className="secondary-button"
                      onClick={() => setEdit(category)}
                    >
                      Rename
                    </button>
                    {![
                      'FUEL',
                      'PARKING',
                      'VEHICLE_INSURANCE',
                      'PROFESSIONAL_LIABILITY_INSURANCE',
                    ].includes(category.systemKey ?? '') ? (
                      <button
                        className={
                          category.active ? 'danger-button' : 'secondary-button'
                        }
                        onClick={() =>
                          void update(category, { active: !category.active })
                        }
                      >
                        {category.active ? 'Deactivate' : 'Reactivate'}
                      </button>
                    ) : null}
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
