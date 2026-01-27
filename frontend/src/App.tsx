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
  const { setCities, setShops, setWholesaleShops, setAccessList, shops } = useMapStore();
  const [selectedShop, setSelectedShop] = useState<Shop | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const mapResetRef = useRef<(() => void) | null>(null);
  const mapFlyToShopRef = useRef<((shop: Shop) => void) | null>(null);

  // Функция для загрузки и обновления данных (используется при первой загрузке и периодически)
  const loadData = async () => {
    const [citiesData, allShops, wholesaleData, accessList] = await Promise.all([
      api.getCities(),
      api.getAllShops(),
      api.getWholesaleShops(),
      api.getAccessList()
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
    
    // wholesaleData теперь { products: [], total: N } - не используется для маркеров
    // Просто сохраняем для WholesaleCatalog
    
    // Подсчитываем количество магазинов для каждого города
    const shopsByCity = shopsWithActivity.reduce((acc: Record<string, number>, shop: Shop) => {
      const cityName = shop.city || '';
      acc[cityName] = (acc[cityName] || 0) + 1;
      return acc;
    }, {});
    
    // ОПТ товары доступны всем городам если есть в accessList
    const hasWholesale = wholesaleData.products && wholesaleData.products.length > 0;
    
    // Добавляем счетчик магазинов к городам из API
    const citiesWithShopCounts = citiesData.map((city: City) => ({
      ...city,
      shops: shopsByCity[city.name] || 0,
      hasWholesale: hasWholesale // ОПТ показывается если есть товары и пользователь в списке доступа
    }));
    
    // ВАЖНО: Обновляем глобальный массив CITIES_WITHOUT_SHOPS_VISUAL
    updateCitiesWithoutShops(citiesWithShopCounts.map((c: City) => ({ name: c.name, shops: typeof c.shops === 'number' ? c.shops : 0 })));
    
    // Устанавливаем магазины и города ВМЕСТЕ
    setShops(shopsWithActivity);
    setWholesaleShops([]); // Очищаем - ОПТ это товары, а не магазины
    setAccessList(accessList);
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
    
    // Обработчик события переключения магазина из поиска
    const handleShopSelect = (event: CustomEvent) => {
      setSelectedShop(event.detail);
    };
    
    showBackButton(handleBack);
    window.addEventListener('shop-select', handleShopSelect as EventListener);
    
    return () => {
      hideBackButton(handleBack);
      window.removeEventListener('shop-select', handleShopSelect as EventListener);
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
      {!isLoading && shops.length > 0 && (
        <SearchBar 
          onShopSelect={handleShopClick}
          shops={shops}
          onFlyToShop={(shop) => {
            if (mapFlyToShopRef.current) {
              mapFlyToShopRef.current(shop);
            }
          }}
          onCloseCatalog={() => setSelectedShop(null)}
          isShopInfoOpen={selectedShop !== null}
        />
      )}
    </div>
  );
}
