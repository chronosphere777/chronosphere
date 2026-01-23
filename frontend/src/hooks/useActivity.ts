// React hook для отслеживания активности и получения счетчиков

import { useEffect, useState, useCallback } from 'preact/hooks';
import { trackActivity, getActivityStats, ActivityStats } from '../api/activity';

// Генерация уникального ID сессии (сохраняется в sessionStorage)
// Очищается при закрытии вкладки - не требует согласия на cookies
function getUserId(): string {
  let userId = sessionStorage.getItem('user_id');
  if (!userId) {
    userId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    sessionStorage.setItem('user_id', userId);
  }
  return userId;
}

interface UseActivityOptions {
  city?: string;
  category?: string;
  shop_id?: string;
  enabled?: boolean;
}

export function useActivity(options: UseActivityOptions = {}) {
  const [stats, setStats] = useState<ActivityStats | null>(null);
  const userId = getUserId();

  // ВРЕМЕННО ОТКЛЮЧЕНО: endpoints активности не развернуты на сервере
  const ACTIVITY_ENABLED = false;

  // Отправка текущего контекста на сервер
  const updateContext = useCallback(() => {
    if (!options.enabled || !ACTIVITY_ENABLED) return;
    
    trackActivity({
      user_id: userId,
      city: options.city,
      category: options.category,
      shop_id: options.shop_id
    });
  }, [userId, options.city, options.category, options.shop_id, options.enabled]);

  // Получение статистики
  const updateStats = useCallback(async () => {
    if (!ACTIVITY_ENABLED) return;
    const data = await getActivityStats();
    if (data) setStats(data);
  }, []);

  // При изменении контекста - отправляем на сервер
  useEffect(() => {
    if (!options.enabled) return;
    
    updateContext();
    updateStats();
    
    // Периодическое обновление (каждые 15 секунд)
    const contextInterval = setInterval(updateContext, 15000);
    const statsInterval = setInterval(updateStats, 15000);
    
    return () => {
      clearInterval(contextInterval);
      clearInterval(statsInterval);
    };
  }, [options.enabled, updateContext, updateStats]);

  return {
    stats,
    userId,
    refresh: () => {
      updateContext();
      updateStats();
    }
  };
}

// Хелпер для получения счетчика конкретного места
export function getCount(stats: ActivityStats | null, type: 'city' | 'category' | 'shop', key: string): number {
  if (!stats) return 0;
  
  switch (type) {
    case 'city':
      return stats.cities[key] || 0;
    case 'category':
      return stats.categories[key] || 0;
    case 'shop':
      return stats.shops[key] || 0;
    default:
      return 0;
  }
}
