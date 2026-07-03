import { useEffect, useState, type FormEvent } from 'react'
import { fetchTasks, createTask, updateTask, deleteTask } from '../api'
import { PRIORITY_LABEL, type Priority, type Task } from '../types'
import { formatDateTime } from '../format'

const PRIORITIES: Priority[] = ['high', 'medium', 'low']

type TaskPatch = Partial<Pick<Task, 'title' | 'description' | 'priority' | 'due_date'>> & {
  completed?: boolean
}

export default function TasksView({ refreshKey }: { refreshKey: number }) {
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // formulario de alta rápida
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState<Priority>('high')
  const [dueDate, setDueDate] = useState('')
  const [showDate, setShowDate] = useState(false)
  const [showDesc, setShowDesc] = useState(false)

  const [editingId, setEditingId] = useState<number | null>(null)

  const load = () => {
    fetchTasks()
      .then(setTasks)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }

  useEffect(load, [refreshKey])

  const add = async (e: FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return
    setError('')
    try {
      const task = await createTask(
        title.trim(),
        priority,
        showDate && dueDate ? dueDate : null,
        showDesc && description.trim() ? description.trim() : null
      )
      setTasks((prev) => [task, ...prev])
      setTitle('')
      setDescription('')
      setDueDate('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al crear la tarea')
    }
  }

  const patch = async (id: number, changes: TaskPatch) => {
    setError('')
    try {
      const updated = await updateTask(id, changes)
      setTasks((prev) => prev.map((t) => (t.id === id ? updated : t)))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al actualizar')
    }
  }

  const remove = async (id: number) => {
    setError('')
    try {
      await deleteTask(id)
      setTasks((prev) => prev.filter((t) => t.id !== id))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al eliminar')
    }
  }

  const pending = tasks.filter((t) => !t.completed)
  const completed = tasks.filter((t) => t.completed)

  return (
    <div className="tasks-view">
      <form className="quick-add" onSubmit={add}>
        <input
          className="quick-add-title"
          placeholder="¿Qué tienes pendiente?"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={300}
        />
        {showDesc && (
          <textarea
            className="quick-add-desc"
            placeholder="Descripción (opcional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={2000}
            rows={2}
          />
        )}
        <div className="quick-add-row">
          <div className="priority-picker" role="radiogroup" aria-label="Prioridad">
            {PRIORITIES.map((p) => (
              <button
                key={p}
                type="button"
                className={`priority-chip p-${p} ${priority === p ? 'selected' : ''}`}
                onClick={() => setPriority(p)}
              >
                {PRIORITY_LABEL[p]}
              </button>
            ))}
          </div>
          {!showDesc && (
            <button type="button" className="btn-link" onClick={() => setShowDesc(true)}>
              + descripción
            </button>
          )}
          {showDate ? (
            <input
              type="date"
              className="date-input"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          ) : (
            <button type="button" className="btn-link" onClick={() => setShowDate(true)}>
              + fecha límite
            </button>
          )}
          <button className="btn-primary" type="submit" disabled={!title.trim()}>
            Añadir
          </button>
        </div>
      </form>

      {error && <p className="form-error">{error}</p>}
      {loading && <p className="muted">Cargando…</p>}

      {!loading && pending.length === 0 && (
        <p className="empty-state">Nada pendiente. Añade una tarea y deja que te lo recuerde. 🎉</p>
      )}

      {PRIORITIES.map((p) => {
        const group = pending.filter((t) => t.priority === p)
        if (group.length === 0) return null
        return (
          <section key={p} className="task-group">
            <h2 className={`group-title p-${p}`}>
              Prioridad {PRIORITY_LABEL[p].toLowerCase()} <span>({group.length})</span>
            </h2>
            <ul className="task-list">
              {group.map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  editing={editingId === task.id}
                  onToggleEdit={() => setEditingId(editingId === task.id ? null : task.id)}
                  onPatch={patch}
                  onRemove={remove}
                />
              ))}
            </ul>
          </section>
        )
      })}

      {completed.length > 0 && (
        <details className="completed-section">
          <summary>Completadas ({completed.length})</summary>
          <ul className="task-list">
            {completed.map((task) => (
              <li key={task.id} className="task-row completed">
                <input
                  type="checkbox"
                  className="task-checkbox"
                  checked
                  onChange={() => patch(task.id, { completed: false })}
                  aria-label={`Reabrir «${task.title}»`}
                  title="Marcar como pendiente"
                />
                <div className="task-main">
                  <span className="task-title">{task.title}</span>
                  <span className="task-meta">
                    Creada el {formatDateTime(task.created_at)}
                    {task.completed_at && ` · completada el ${formatDateTime(task.completed_at)}`}
                  </span>
                </div>
                <button className="icon-btn" onClick={() => remove(task.id)} aria-label="Eliminar">
                  ×
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  )
}

function TaskRow({
  task,
  editing,
  onToggleEdit,
  onPatch,
  onRemove,
}: {
  task: Task
  editing: boolean
  onToggleEdit: () => void
  onPatch: (id: number, changes: TaskPatch) => Promise<void>
  onRemove: (id: number) => void
}) {
  const [title, setTitle] = useState(task.title)
  const [description, setDescription] = useState(task.description ?? '')
  const [priority, setPriority] = useState<Priority>(task.priority)
  const [dueDate, setDueDate] = useState(task.due_date ?? '')

  const save = async (e: FormEvent) => {
    e.preventDefault()
    await onPatch(task.id, {
      title: title.trim(),
      description: description.trim() || null,
      priority,
      due_date: dueDate || null,
    })
    onToggleEdit()
  }

  return (
    <li className={`task-row p-${task.priority}`}>
      <input
        type="checkbox"
        className="task-checkbox"
        checked={false}
        onChange={() => onPatch(task.id, { completed: true })}
        aria-label={`Completar «${task.title}»`}
        title="Marcar como completada"
      />
      <div className="task-main">
        <span className="task-title">{task.title}</span>
        {task.description && <span className="task-desc">{task.description}</span>}
        <span className="task-meta">Creada el {formatDateTime(task.created_at)}</span>
      </div>
      {task.due_date && <span className="due-chip">📅 {task.due_date}</span>}
      <select
        className={`priority-select p-${task.priority}`}
        value={task.priority}
        onChange={(e) => onPatch(task.id, { priority: e.target.value as Priority })}
        aria-label={`Cambiar prioridad de «${task.title}»`}
        title="Cambiar prioridad"
      >
        {PRIORITIES.map((p) => (
          <option key={p} value={p}>
            {PRIORITY_LABEL[p]}
          </option>
        ))}
      </select>
      <button className="icon-btn" onClick={onToggleEdit} aria-label="Editar">
        ✎
      </button>
      <button className="icon-btn" onClick={() => onRemove(task.id)} aria-label="Eliminar">
        ×
      </button>
      {editing && (
        <form className="task-edit" onSubmit={save}>
          <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={300} required />
          <textarea
            className="task-edit-desc"
            placeholder="Descripción (opcional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={2000}
            rows={2}
          />
          <select value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {PRIORITY_LABEL[p]}
              </option>
            ))}
          </select>
          <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          <button className="btn-primary" type="submit">
            Guardar
          </button>
        </form>
      )}
    </li>
  )
}
