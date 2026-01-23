import { useEffect, useState, useRef } from 'preact/hooks';
import { MapView } from './components/MapView';
import { LoadingScreen } from './components/LoadingScreen';
import { ShopInfo } from './components/ShopInfo';
import { SearchBar } from './components/SearchBar';
import { useMapStore } from './store/mapStore';
import { api, updateCitiesWithoutShops } from './api/client';
import type { Shop, City } from './types';
import { showBackButton, hideBackButton, hapticFeedback } from './utils/telegram';

export function App() {
  const { setCities, setShops, shops } = useMapStore();
  const [selectedShop, setSelectedShop] = useState<Shop | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const mapResetRef = useRef<(() => void) | null>(null);
  const mapFlyToShopRef = useRef<((shop: Shop) => void) | null>(null);

  // Функция для загрузки и обновления данных (используется при первой загрузке и периодически)
  const loadData = async () => {
    const [citiesData, allShops] = await Promise.all([
      api.getCities(),
      api.getAllShops()
    ]);
    
    // ВАЖНО: Если API вернул пустой массив магазинов (ошибка/таймаут), не обновляем данные
    if (allShops.length === 0) {
      console.warn('API returned empty shops array, skipping update');
      return;
    }
    
    // Добавляем активность к магазинам
    const shopsWithActivity = allShops.map((shop: any) => ({
      ...shop,
      activity: Math.random() * 0.5 + 0.5, // 0.5-1.0
    }));
    
    // Подсчитываем количество магазинов для каждого города
    const shopsByCity = shopsWithActivity.reduce((acc: Record<string, number>, shop: Shop) => {
      const cityName = shop.city || '';
      acc[cityName] = (acc[cityName] || 0) + 1;
      return acc;
    }, {});
    
    // Добавляем счетчик магазинов к городам из API
    const citiesWithShopCounts = citiesData.map((city: City) => ({
      ...city,
      shops: shopsByCity[city.name] || 0
    }));
    
    // ВАЖНО: Обновляем глобальный массив CITIES_WITHOUT_SHOPS_VISUAL
    updateCitiesWithoutShops(citiesWithShopCounts.map((c: City) => ({ name: c.name, shops: typeof c.shops === 'number' ? c.shops : 0 })));
    
    // Устанавливаем магазины и города ВМЕСТЕ
    setShops(shopsWithActivity);
    setCities(citiesWithShopCounts);
  };

  useEffect(() => {
    // Первая загрузка при монтировании
    loadData();
    
    // Периодическая проверка на наличие новых магазинов каждые 30 секунд
    const interval = setInterval(() => {
      loadData();
    }, 30000);
    
    return () => clearInterval(interval);
  }, []); // ПУСТОЙ массив зависимостей - настраиваем интервал ОДИН РАЗ
  
  useEffect(() => {
    // Настройка кнопки "Назад" в Telegram
    const handleBack = () => {
      hapticFeedback('light');
      if (selectedShop) {
        setSelectedShop(null);
      }
    };
    
    showBackButton(handleBack);
    
    return () => {
      hideBackButton(handleBack);
    };
  }, [selectedShop]);

  const handleShopClick = (shop: Shop) => {
    setSelectedShop(shop);
  };
  
  const handleLoadingComplete = () => {
    setIsLoading(false);
  };

  if (isLoading) {
    return <LoadingScreen onComplete={handleLoadingComplete} />;
  }

  return (
    <div className="app">
      <MapView 
        onShopClick={handleShopClick} 
        onResetMap={(fn) => { mapResetRef.current = fn; }}
        onFlyToShop={(fn) => { mapFlyToShopRef.current = fn; }}
        isShopInfoOpen={selectedShop !== null}
      />
      {selectedShop && <ShopInfo shop={selectedShop} onClose={() => setSelectedShop(null)} />}
      <SearchBar 
        onShopSelect={handleShopClick}
        shops={shops}
        onFlyToShop={(shop) => {
          if (mapFlyToShopRef.current) {
            mapFlyToShopRef.current(shop);
          }
        }}
      />
    </div>
  );
}
