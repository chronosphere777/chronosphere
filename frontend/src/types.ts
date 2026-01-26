export interface Shop {
  id: string;
  name: string;
  lat: number;
  lng: number;
  city: string;
  activity: number; // 0-1, нейронная активность
  category: string; // Категория магазина из столбца A
  photo_url?: string | null;
  spreadsheet_url?: string;
  description?: string | null; // Описание магазина из столбца G
  username?: string | null; // Telegram username из столбца J
  gis_url?: string | null; // 2GIS ссылка из столбца F
}

export interface AccessEntry {
  city: string;
  telegram_id: string;
  shop_name: string;
}

export interface City {
  name: string;
  apiName?: string; // оригинальное название для API запросов (например "Ishim")
  lat: number;
  lng: number;
  shops: Shop[] | number; // Массив магазинов или количество
  hasWholesale?: boolean; // Есть ли оптовые магазины в городе
}

export interface NeuralConnection {
  from: Shop;
  to: Shop;
  strength: number; // 0-1
  pulsePhase: number; // 0-2π для анимации
}
