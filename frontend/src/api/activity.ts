// API для отслеживания активности пользователей

const API_BASE = 'https://chronosphere7777.pythonanywhere.com';

export interface ActivityContext {
  user_id: string;
  city?: string;
  category?: string;
  shop_id?: string;
}

export interface ActivityStats {
  cities: Record<string, number>;
  categories: Record<string, number>;
  shops: Record<string, number>;
  total: number;
}

// Трекинг активности пользователя
export async function trackActivity(context: ActivityContext): Promise<void> {
  try {
    await fetch(`${API_BASE}/api/activity/track`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(context)
    });
  } catch (error) {
    console.error('Failed to track activity:', error);
  }
}

// Получение статистики активных пользователей
export async function getActivityStats(): Promise<ActivityStats | null> {
  try {
    const response = await fetch(`${API_BASE}/api/activity/stats`);
    if (!response.ok) throw new Error('Failed to fetch stats');
    return await response.json();
  } catch (error) {
    console.error('Failed to get activity stats:', error);
    return null;
  }
}
