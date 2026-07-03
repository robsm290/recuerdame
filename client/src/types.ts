export type Priority = 'high' | 'medium' | 'low'

export interface Task {
  id: number
  title: string
  description: string | null
  priority: Priority
  due_date: string | null
  completed: number
  created_at: string
  completed_at: string | null
}

export interface NotificationEntry {
  id: number
  title: string
  body: string
  priority: Priority
  task_count: number
  delivered: number
  sent_at: string
}

export interface Settings {
  start_time: string
  end_time: string
  interval_minutes: number
  timezone: string
  alarm_sound: string
}

export interface ReminderPayload {
  type: 'reminder'
  title: string
  body: string
  priority: Priority
  count: number
}

export const PRIORITY_LABEL: Record<Priority, string> = {
  high: 'Alta',
  medium: 'Media',
  low: 'Baja',
}
