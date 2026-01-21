import { useRef, useEffect, useState, useMemo } from 'preact/hooks';
import { useMapStore } from '../store/mapStore';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { Shop } from '../types';
import { neonRoadsStyle } from '../styles/neon-roads-style';
import { requestLocation, hapticFeedback } from '../utils/telegram';
import { CITIES_WITHOUT_SHOPS_VISUAL, CITY_COORDS } from '../api/client';
import { CategoryModal } from './CategoryModal';
import { CityModal } from './CityModal';
import { useActivity, getCount } from '../hooks/useActivity';
import { getUserCounterHTML } from './UserCounter';

interface MapViewProps {
  onShopClick?: (shop: Shop) => void;
  onResetMap?: (resetFn: () => void) => void;
  isShopInfoOpen?: boolean;
}

export function MapView({ onShopClick, onResetMap, isShopInfoOpen = false }: MapViewProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const pixelOverlayRef = useRef<HTMLCanvasElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const markers = useRef<maplibregl.Marker[]>([]);
  const userMarker = useRef<maplibregl.Marker | null>(null);
  const userLocationRef = useRef<[number, number] | null>(null);
  const shopPulseAnimationId = useRef<number | null>(null);
  const { shops, selectedCity, cities } = useMapStore();
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null);
  const [clusterShops, setClusterShops] = useState<Shop[] | null>(null);
  const [showCityLabels, setShowCityLabels] = useState<boolean>(false);
  const [showCitySelector, setShowCitySelector] = useState<boolean>(false);
  const cityLabelsRef = useRef<maplibregl.Marker[]>([]);
  const whiteCityLabelsRef = useRef<maplibregl.Marker[]>([]); // Для белых городов
  const [selectedShop, setSelectedShop] = useState<Shop | null>(null);
  const [isSelectingLocation, setIsSelectingLocation] = useState(false);
  const [popupShop, setPopupShop] = useState<Shop | null>(null);
  const [popupPosition, setPopupPosition] = useState<{ x: number; y: number } | null>(null);
  const [echoWave, setEchoWave] = useState<{ x: number; y: number; radius: number; angle: number; opacity?: number } | null>(null);
  const [currentZoom, setCurrentZoom] = useState<number>(5);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const selectedCategoryRef = useRef<string | null>(null);
  const [showEmptyCityModal, setShowEmptyCityModal] = useState<boolean>(false);

  // Отслеживание активности на карте (передаем текущий город)
  const { stats } = useActivity({
    city: selectedCity?.name,
    enabled: true
  });

  // Синхронизируем ref с state
  useEffect(() => {
    userLocationRef.current = userLocation;
  }, [userLocation]);

  useEffect(() => {
    selectedCategoryRef.current = selectedCategory;
  }, [selectedCategory]);

  // Передаем функцию resetRoute родительскому компоненту
  useEffect(() => {
    if (onResetMap) {
      onResetMap(resetRoute);
    }
  }, [onResetMap]);


  // Обновляем позицию popup при движении/масштабировании карты
  useEffect(() => {
    if (!map.current || !popupShop) return;

    const updatePopupPosition = () => {
      if (map.current && popupShop) {
        const point = map.current.project([popupShop.lng, popupShop.lat]);
        setPopupPosition({ x: point.x, y: point.y });
      }
    };

    map.current.on('move', updatePopupPosition);
    map.current.on('zoom', updatePopupPosition);

    return () => {
      if (map.current) {
        map.current.off('move', updatePopupPosition);
        map.current.off('zoom', updatePopupPosition);
      }
    };
  }, [popupShop]);

  // Функция построения маршрута через OSRM API
  const buildRoute = async (from: [number, number], to: [number, number]) => {
    try {
      const url = `https://router.project-osrm.org/route/v1/driving/${from[0]},${from[1]};${to[0]},${to[1]}?overview=full&geometries=geojson`;
      const response = await fetch(url);
      const data = await response.json();
      
      if (data.code === 'Ok' && data.routes.length > 0) {
        return data.routes[0].geometry;
      }
    } catch (error) {
    }
    return null;
  };

  // Debounce таймер больше не нужен - дороги загружаются один раз
  const cityRoadsLoaded = useRef<{[key: string]: boolean}>({}); // Флаги для каждого города (полные дороги)
  const cityRoadsData = useRef<{[key: string]: any}>({}); // Данные дорог для каждого города
  const pulseIntervals = useRef<number[]>([]); // Храним ID интервалов пульсации
  const loadedCityName = useRef<string | null>(null); // Текущий загруженный город
  const skipAutoLoadRef = useRef<boolean>(false); // Флаг для пропуска автозагрузки при программном переходе
  const pendingCityLoadRef = useRef<typeof cities[0] | null>(null); // Город ожидающий загрузки после moveend
  const zoomDebounceTimer = useRef<any>(null); // Таймер debounce для zoom события

  // Инициализация пустых sources и layers для всех типов дорог
  const initAllRoadLayers = () => {
    if (!map.current) return;
    
    const roadTypes = ['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 
                       'residential', 'unclassified', 'road', 'service', 'living_street',
                       'footway', 'path', 'track', 'cycleway', 'pedestrian'];
    
    roadTypes.forEach(type => {
      const sourceId = `roads-${type}`;
      
      // Создаём пустой source
      map.current!.addSource(sourceId, {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: []
        }
      });
      
      // Создаём слои в зависимости от типа дороги
      if (type === 'motorway') {
        // 4-слойная структура для главных дорог
        map.current!.addLayer({
          id: `${sourceId}-glow-outer`,
          type: 'line',
          source: sourceId,
          paint: {
            'line-color': '#cc5500',
            'line-width': ['interpolate', ['exponential', 1.6], ['zoom'], 3, 2, 5, 6, 10, 14, 16, 28],
            'line-blur': 15,
            'line-opacity': ['interpolate', ['linear'], ['zoom'], 3, 0.6, 9, 0.4]
          }
        });
        map.current!.addLayer({
          id: `${sourceId}-base`,
          type: 'line',
          source: sourceId,
          paint: {
            'line-color': '#cc6600',
            'line-width': ['interpolate', ['exponential', 1.6], ['zoom'], 3, 1, 5, 3, 10, 7, 16, 14],
            'line-opacity': ['interpolate', ['linear'], ['zoom'], 3, 0.7, 9, 0.6]
          }
        });
        map.current!.addLayer({
          id: `${sourceId}-inner`,
          type: 'line',
          source: sourceId,
          paint: {
            'line-color': '#1a1a1a',
            'line-width': ['interpolate', ['exponential', 1.6], ['zoom'], 3, 0.8, 5, 2.5, 10, 6, 16, 12],
            'line-opacity': ['interpolate', ['linear'], ['zoom'], 3, 0.7, 9, 0.6]
          }
        });
        map.current!.addLayer({
          id: `${sourceId}-vein`,
          type: 'line',
          source: sourceId,
          paint: {
            'line-color': '#f0f8ff',
            'line-width': ['interpolate', ['exponential', 1.6], ['zoom'], 3, 0.5, 5, 1, 10, 2.5, 16, 5],
            'line-opacity': ['interpolate', ['linear'], ['zoom'], 3, 0.8, 9, 0.6]
          }
        });
      } else if (type === 'trunk' || type === 'primary') {
        map.current!.addLayer({
          id: `${sourceId}-glow-outer`,
          type: 'line',
          source: sourceId,
          paint: {
            'line-color': '#dd7722',
            'line-width': ['interpolate', ['exponential', 1.6], ['zoom'], 5, 2, 8, 4, 12, 11, 16, 21],
            'line-blur': 10,
            'line-opacity': ['interpolate', ['linear'], ['zoom'], 5, 0.5, 9, 0.4]
          }
        });
        map.current!.addLayer({
          id: `${sourceId}-base`,
          type: 'line',
          source: sourceId,
          paint: {
            'line-color': '#dd8822',
            'line-width': ['interpolate', ['exponential', 1.6], ['zoom'], 5, 1, 8, 2, 12, 6, 16, 11],
            'line-opacity': ['interpolate', ['linear'], ['zoom'], 5, 0.6, 9, 0.6]
          }
        });
        map.current!.addLayer({
          id: `${sourceId}-inner`,
          type: 'line',
          source: sourceId,
          paint: {
            'line-color': '#1a1a1a',
            'line-width': ['interpolate', ['exponential', 1.6], ['zoom'], 5, 0.8, 8, 2, 12, 5, 16, 10],
            'line-opacity': ['interpolate', ['linear'], ['zoom'], 5, 0.6, 9, 0.6]
          }
        });
        map.current!.addLayer({
          id: `${sourceId}-vein`,
          type: 'line',
          source: sourceId,
          paint: {
            'line-color': '#f0f8ff',
            'line-width': ['interpolate', ['exponential', 1.6], ['zoom'], 5, 0.4, 8, 0.8, 12, 2, 16, 4],
            'line-opacity': ['interpolate', ['linear'], ['zoom'], 5, 0.7, 9, 0.6]
          }
        });
      } else if (type === 'secondary' || type === 'tertiary' || type === 'residential' || 
                 type === 'unclassified' || type === 'road') {
        map.current!.addLayer({
          id: `${sourceId}-glow-outer`,
          type: 'line',
          source: sourceId,
          paint: {
            'line-color': '#aa6611',
            'line-width': ['interpolate', ['exponential', 1.6], ['zoom'], 8, 1, 12, 3, 16, 11],
            'line-blur': 5,
            'line-opacity': ['interpolate', ['linear'], ['zoom'], 8, 0.2, 12, 0.3]
          }
        });
        map.current!.addLayer({
          id: `${sourceId}-base`,
          type: 'line',
          source: sourceId,
          paint: {
            'line-color': '#cc7722',
            'line-width': ['interpolate', ['exponential', 1.6], ['zoom'], 8, 0.8, 12, 1.5, 16, 6],
            'line-opacity': ['interpolate', ['linear'], ['zoom'], 8, 0.4, 12, 0.6]
          }
        });
        map.current!.addLayer({
          id: `${sourceId}-inner`,
          type: 'line',
          source: sourceId,
          paint: {
            'line-color': '#1a1a1a',
            'line-width': ['interpolate', ['exponential', 1.6], ['zoom'], 8, 0.6, 12, 1, 16, 4],
            'line-opacity': ['interpolate', ['linear'], ['zoom'], 8, 0.4, 12, 0.6]
          }
        });
        map.current!.addLayer({
          id: `${sourceId}-vein`,
          type: 'line',
          source: sourceId,
          paint: {
            'line-color': '#f0f8ff',
            'line-width': ['interpolate', ['exponential', 1.6], ['zoom'], 8, 0.3, 12, 0.5, 16, 2],
            'line-opacity': ['interpolate', ['linear'], ['zoom'], 8, 0.5, 12, 0.6]
          }
        });
      } else {
        // Для остальных типов (service, living_street, footway и т.д.) - простой слой
        map.current!.addLayer({
          id: `${sourceId}-base`,
          type: 'line',
          source: sourceId,
          paint: {
            'line-color': '#aa6611',
            'line-width': ['interpolate', ['exponential', 1.6], ['zoom'], 12, 0.5, 14, 1, 18, 3],
            'line-opacity': ['interpolate', ['linear'], ['zoom'], 12, 0.3, 14, 0.4]
          }
        });
      }
    });
    
    // Инициализация слоёв для крупных городов России (отображаются на zoom < 8)
    // БЕЛЫЕ дороги - города БЕЗ магазинов
    // Trunk/motorway (белые)
    map.current!.addSource('russia-cities-white-trunk-source', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] }
    });
    
    map.current!.addLayer({
      id: 'russia-cities-white-trunk-glow',
      type: 'line',
      source: 'russia-cities-white-trunk-source',
      paint: {
        'line-color': '#ffffff',
        'line-width': ['interpolate', ['linear'], ['zoom'], 4, 2, 7, 4],
        'line-blur': 6,
        'line-opacity': 0.5
      },
      layout: { 'visibility': 'none' }
    });
    
    map.current!.addLayer({
      id: 'russia-cities-white-trunk',
      type: 'line',
      source: 'russia-cities-white-trunk-source',
      paint: {
        'line-color': '#ffffff',
        'line-width': ['interpolate', ['linear'], ['zoom'], 4, 1, 7, 2],
        'line-opacity': 0.7
      },
      layout: { 'visibility': 'none' }
    });
    
    // Primary (белые)
    map.current!.addSource('russia-cities-white-primary-source', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] }
    });
    
    map.current!.addLayer({
      id: 'russia-cities-white-primary-glow',
      type: 'line',
      source: 'russia-cities-white-primary-source',
      paint: {
        'line-color': '#ffffff',
        'line-width': ['interpolate', ['linear'], ['zoom'], 4, 1.5, 7, 3],
        'line-blur': 4,
        'line-opacity': 0.4
      },
      layout: { 'visibility': 'none' }
    });
    
    map.current!.addLayer({
      id: 'russia-cities-white-primary',
      type: 'line',
      source: 'russia-cities-white-primary-source',
      paint: {
        'line-color': '#ffffff',
        'line-width': ['interpolate', ['linear'], ['zoom'], 4, 0.8, 7, 1.5],
        'line-opacity': 0.6
      },
      layout: { 'visibility': 'none' }
    });

    // Secondary + Tertiary (белые - чуть тоньше)
    map.current!.addSource('russia-cities-white-secondary-source', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] }
    });
    
    map.current!.addLayer({
      id: 'russia-cities-white-secondary-glow',
      type: 'line',
      source: 'russia-cities-white-secondary-source',
      paint: {
        'line-color': '#ffffff',
        'line-width': ['interpolate', ['linear'], ['zoom'], 4, 1, 7, 2],
        'line-blur': 3,
        'line-opacity': 0.3
      },
      layout: { 'visibility': 'none' }
    });
    
    map.current!.addLayer({
      id: 'russia-cities-white-secondary',
      type: 'line',
      source: 'russia-cities-white-secondary-source',
      paint: {
        'line-color': '#ffffff',
        'line-width': ['interpolate', ['linear'], ['zoom'], 4, 0.5, 7, 1],
        'line-opacity': 0.5
      },
      layout: { 'visibility': 'none' }
    });

    // Белые неоновые дороги между городами БЕЗ магазинов (zoom 4-11.5)
    // Генерируем связи между ближайшими городами
    const generateInterCityRoads = () => {
      const cityCoordsList = Object.entries(CITY_COORDS).map(([name, coords]) => ({
        name,
        lat: coords.lat,
        lng: coords.lng
      }));
      
      const features: any[] = [];
      const maxDistance = 800; // км - максимальное расстояние для связи
      const connectionsPerCity = 3; // количество ближайших городов для связи
      
      // Функция расчета расстояния (примерная)
      const getDistance = (lat1: number, lng1: number, lat2: number, lng2: number) => {
        const R = 6371; // Радиус Земли в км
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLng = (lng2 - lng1) * Math.PI / 180;
        const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                  Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                  Math.sin(dLng/2) * Math.sin(dLng/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        return R * c;
      };
      
      // Для каждого города находим ближайшие города
      const addedConnections = new Set<string>();
      
      cityCoordsList.forEach(city1 => {
        const distances = cityCoordsList
          .filter(city2 => city2.name !== city1.name)
          .map(city2 => ({
            city: city2,
            distance: getDistance(city1.lat, city1.lng, city2.lat, city2.lng)
          }))
          .filter(d => d.distance <= maxDistance)
          .sort((a, b) => a.distance - b.distance)
          .slice(0, connectionsPerCity);
        
        distances.forEach(({ city: city2 }) => {
          const connectionKey = [city1.name, city2.name].sort().join('|');
          if (!addedConnections.has(connectionKey)) {
            addedConnections.add(connectionKey);
            features.push({
              type: 'Feature',
              geometry: {
                type: 'LineString',
                coordinates: [
                  [city1.lng, city1.lat],
                  [city2.lng, city2.lat]
                ]
              },
              properties: {}
            });
          }
        });
      });
      
      return { type: 'FeatureCollection', features };
    };
    
    map.current!.addSource('no-shops-inter-city-roads', {
      type: 'geojson',
      data: generateInterCityRoads()
    });
    
    map.current!.addLayer({
      id: 'no-shops-inter-city-roads-glow',
      type: 'line',
      source: 'no-shops-inter-city-roads',
      paint: {
        'line-color': '#ffffff',
        'line-width': ['interpolate', ['linear'], ['zoom'], 4, 3, 10, 8, 11.5, 10],
        'line-blur': 12,
        'line-opacity': 0.4
      },
      layout: { 'visibility': 'none' }
    });
    
    map.current!.addLayer({
      id: 'no-shops-inter-city-roads',
      type: 'line',
      source: 'no-shops-inter-city-roads',
      paint: {
        'line-color': '#ffffff',
        'line-width': ['interpolate', ['linear'], ['zoom'], 4, 1.5, 10, 4, 11.5, 5],
        'line-opacity': 0.6
      },
      layout: { 'visibility': 'none' }
    });
    
  };

  // Создаём белые прямые линии между ВСЕМИ городами

  // Определяем ближайший город по центру карты
  const findNearestCity = (center: [number, number]) => {
    if (cities.length === 0) return null;
    
    let nearestCity = cities[0];
    let minDistance = Math.hypot(
      center[0] - nearestCity.lng,
      center[1] - nearestCity.lat
    );
    
    cities.forEach(city => {
      const distance = Math.hypot(
        center[0] - city.lng,
        center[1] - city.lat
      );
      if (distance < minDistance) {
        minDistance = distance;
        nearestCity = city;
      }
    });
    
    // Возвращаем только если расстояние < 0.5 градусов (~50км)
    return minDistance < 0.5 ? nearestCity : null;
  };



  // Функция для преобразования названия города в slug (транслитерация)
  const cityToSlug = (cityName: string) => {
    // Словарь особых случаев транслитерации (совпадает с Python версией)
    const citySlugMap: Record<string, string> = {
      'Екатеринбург': 'yekaterinburg',
      'Астрахань': 'astrakhan',
      'Благовещенск': 'blagoveshchensk',
      'Москва': 'moscow',
      'Махачкала': 'makhachkala',
      'Находка': 'nakhodka',
      'Нижний Новгород': 'nizhny-novgorod',
      'Орёл': 'oryol',
      'Салехард': 'salekhard',
      'Санкт-Петербург': 'saint-petersburg',
      'Хабаровск': 'khabarovsk',
      'Южно-Сахалинск': 'yuzhno-sakhalinsk',
    };
    
    // Проверяем специальный словарь
    if (citySlugMap[cityName]) {
      return citySlugMap[cityName];
    }
    
    const translit: Record<string, string> = {
      'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'e',
      'ж': 'zh', 'з': 'z', 'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm',
      'н': 'n', 'о': 'o', 'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u',
      'ф': 'f', 'х': 'h', 'ц': 'ts', 'ч': 'ch', 'ш': 'sh', 'щ': 'sch',
      'ъ': '', 'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'yu', 'я': 'ya'
    };
    
    return cityName.toLowerCase().split('').map(char => 
      translit[char] || (char === ' ' ? '-' : char)
    ).join('').replace(/[^a-z0-9\-]/g, '');
  };

  // Загрузка дорог из статического GeoJSON файла (быстро!) или Flask API (fallback)
  const loadCityRoads = async (cityToLoad?: typeof cities[0]) => {
    const targetCity = cityToLoad || selectedCity;
    if (!map.current || !targetCity) return;
    
    
    // ВСЕГДА обновляем selectedCity в store при смене города
    if (selectedCity?.name !== targetCity.name) {
      const { selectCity } = useMapStore.getState();
      selectCity(targetCity);

    }
    
    // Если город уже загружен - пропускаем повторную загрузку (но selectedCity уже обновлен выше)
    if (cityRoadsLoaded.current[targetCity.name]) {
      loadedCityName.current = targetCity.name;
      return;
    }
    
    // Загружаем магазины этого города если ещё не загружены
    let cityShops = shops.filter(s => s.city === targetCity.name);
    if (cityShops.length === 0) {
      try {
        const { api } = await import('../api/client');
        const loadedShops = await api.getShops(targetCity.name);
        const shopsWithActivity = loadedShops.map((shop: any) => ({
          ...shop,
          activity: Math.random() * 0.5 + 0.5,
          category: shop.category || 'Без категории'
        }));
        const { setShops } = useMapStore.getState();
        setShops([...shops, ...shopsWithActivity]);
        cityShops = shopsWithActivity;
      } catch (error) {
        return;
      }
    } else {
    }
    
    // Даже если нет магазинов, всё равно показываем карту города
    if (cityShops.length === 0) {
      // НЕ делаем return - продолжаем загружать дороги ниже
    }
    
    try {
      // Сначала пробуем загрузить статический файл (мгновенно)
      const citySlug = cityToSlug(targetCity.name);
      const staticUrl = `/roads/${citySlug}.geojson`;
      
      
      let response = await fetch(staticUrl);
      let data;
      
      // Если файла нет - НЕ используем Flask API, просто пропускаем
      if (!response.ok) {
        // Файл не найден - город без предсгенерированных дорог
        // Помечаем как "загружен" чтобы больше не пытаться
        cityRoadsLoaded.current[targetCity.name] = true;
        return;
      }
      
      
      // Парсим данные из статического файла
      data = await response.json();
      
      // Проверяем формат данных и конвертируем в GeoJSON если нужно
      if (Array.isArray(data)) {
        // Это Overpass API формат (массив) - конвертируем в GeoJSON
        data = {
          type: 'FeatureCollection',
          features: data
            .filter((way: any) => way.type === 'way' && way.tags?.highway)
            .map((way: any) => ({
              type: 'Feature',
              id: way.id,
              properties: way.tags,
              geometry: {
                type: 'LineString',
                coordinates: way.geometry.map((point: any) => [point.lon, point.lat])
              }
            }))
        };
      } else if (data.elements && Array.isArray(data.elements)) {
        // Это Overpass API формат (объект с elements) - конвертируем в GeoJSON
        data = {
          type: 'FeatureCollection',
          features: data.elements
            .filter((way: any) => way.type === 'way' && way.tags?.highway)
            .map((way: any) => ({
              type: 'Feature',
              id: way.id,
              properties: way.tags,
              geometry: {
                type: 'LineString',
                coordinates: way.geometry.map((point: any) => [point.lon, point.lat])
              }
            }))
        };
      }
      
      if (!data.features || data.features.length === 0) {
        cityRoadsLoaded.current[targetCity.name] = true;
        return;
      }
      
      
      // Останавливаем старые быстрые интервалы пульсации
      pulseIntervals.current.forEach(id => clearInterval(id));
      pulseIntervals.current = [];
      
      // ОПТИМИЗАЦИЯ: Группируем дороги за один проход вместо двух
      const roadsByType: Record<string, any[]> = {};
      const mainRoadTypes = ['motorway', 'trunk', 'primary'];
      
      // GeoJSON уже содержит features, группируем их за один проход
      for (const feature of data.features) {
        const highway = feature.properties?.highway;
        if (!highway) continue;
        
        if (!roadsByType[highway]) {
          roadsByType[highway] = [];
        }
        roadsByType[highway].push(feature);
      }
      
      // Сохраняем данные дорог этого города
      cityRoadsData.current[targetCity.name] = roadsByType;
      
      // ОПТИМИЗАЦИЯ: Обновляем sources эффективнее
      const allTypes = Object.keys(roadsByType);
      
      for (const type of allTypes) {
        const sourceId = `roads-${type}`;
        const source = map.current?.getSource(sourceId);
        
        if (!source || !('setData' in source)) continue;
        
        // Собираем features для этого типа дорог
        const features: any[] = [...roadsByType[type]];
        
        // Для главных дорог добавляем миниатюры других городов
        if (mainRoadTypes.includes(type)) {
          for (const [cityName, cityData] of Object.entries(cityRoadsData.current)) {
            if (cityName === targetCity.name || !cityData[type]) continue;
            features.push(...cityData[type]);
          }
        }
        
        // Обновляем source
        (source as any).setData({
          type: 'FeatureCollection',
          features
        });
        
        // Запускаем пульсацию только для главных дорог
        if (mainRoadTypes.includes(type)) {
          let pulseOpacity = 0.6;
          let increasing = true;
          const intervalId = window.setInterval(() => {
            if (!map.current?.getLayer(`${sourceId}-vein`)) {
              clearInterval(intervalId);
              return;
            }
            
            if (increasing) {
              pulseOpacity += 0.04;
              if (pulseOpacity >= 1) {
                pulseOpacity = 1;
                increasing = false;
              }
            } else {
              pulseOpacity -= 0.04;
              if (pulseOpacity <= 0.6) {
                pulseOpacity = 0.6;
                increasing = true;
              }
            }
            
            try {
              map.current?.setPaintProperty(`${sourceId}-vein`, 'line-opacity', pulseOpacity);
            } catch (e) {
              clearInterval(intervalId);
            }
          }, 200);
          
          pulseIntervals.current.push(intervalId);
        }
      }
      
      
      // Помечаем город как загруженный только после успешной обработки
      cityRoadsLoaded.current[targetCity.name] = true;
      loadedCityName.current = targetCity.name;
      
    } catch (error) {
      console.error(`❌ Ошибка загрузки дорог для ${targetCity.name}:`, error);
      // Удаляем флаг если была ошибка
      delete cityRoadsLoaded.current[targetCity.name];
      delete cityRoadsData.current[targetCity.name];
    }
  };

  // Скрыть/показать слои дорог
  const toggleRoadsVisibility = (visible: boolean) => {
    if (!map.current) return;
    
    const roadLayers = [
      'roads-motorway-glow-outer',
      'roads-motorway-base',
      'roads-motorway-vein',
      'roads-major-glow',
      'roads-major-base',
      'roads-major-vein',
      'roads-minor-glow',
      'roads-minor-base',
      'roads-minor-vein'
    ];

    roadLayers.forEach(layerId => {
      if (map.current?.getLayer(layerId)) {
        map.current.setLayoutProperty(
          layerId,
          'visibility',
          visible ? 'visible' : 'none'
        );
      }
    });
  };

  // Показать маршрут до магазина
  const showRouteToShop = async (shop: Shop, fromLocation?: [number, number]) => {
    const currentLocation = fromLocation || userLocation;
    if (!map.current || !currentLocation) return;

    // НЕ закрываем popup - он уже установлен в обработчике клика
    // setPopupShop(null);
    // setPopupPosition(null);

    // Строим маршрут
    const routeGeometry = await buildRoute(currentLocation, [shop.lng, shop.lat]);
    
    if (routeGeometry) {
      // Сохраняем координаты маршрута для анимации эхо
      const coordinates = routeGeometry.coordinates;

      // Удаляем старый маршрут если есть
      if (map.current.getSource('route')) {
        map.current.removeLayer('route-glow');
        map.current.removeLayer('route-base');
        map.current.removeLayer('route-vein');
        map.current.removeSource('route');
      }

      // Добавляем источник маршрута
      map.current.addSource('route', {
        type: 'geojson',
        data: {
          type: 'Feature',
          properties: {},
          geometry: routeGeometry
        }
      });

      // Свечение маршрута (оранжевое) - начинаем с нулевой прозрачности
      map.current.addLayer({
        id: 'route-glow',
        type: 'line',
        source: 'route',
        paint: {
          'line-color': '#cc5500',
          'line-width': 20,
          'line-blur': 15,
          'line-opacity': 0
        }
      });

      // Основная линия маршрута (оранжевая) - начинаем с нулевой прозрачности
      map.current.addLayer({
        id: 'route-base',
        type: 'line',
        source: 'route',
        paint: {
          'line-color': '#cc6600',
          'line-width': 10,
          'line-opacity': 0
        }
      });

      // Центральная вена маршрута (холодный белый) - начинаем невидимой
      map.current.addLayer({
        id: 'route-vein',
        type: 'line',
        source: 'route',
        paint: {
          'line-color': '#f0f8ff',
          'line-width': 3,
          'line-opacity': 0
        }
      });

      // Запускаем анимацию эхолокации и рисования маршрута
      animateEchoAndRoute(coordinates, currentLocation, shop);

      // Обновляем маркер пользователя
      if (!userMarker.current) {
        const el = document.createElement('div');
        el.className = 'user-marker';
        el.innerHTML = `
          <div style="position: relative; width: 30px; height: 30px;">
            <div style="position: absolute; width: 30px; height: 30px; background: #f0f8ff; border-radius: 50%; opacity: 0.3; animation: pulse 2s infinite;"></div>
            <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 16px; height: 16px; background: #f0f8ff; border-radius: 50%; border: 3px solid white; box-shadow: 0 0 15px #f0f8ff;"></div>
            <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 8px; height: 8px; background: white; border-radius: 50%;"></div>
          </div>
          <style>
            @keyframes pulse {
              0%, 100% { transform: scale(1); opacity: 0.3; }
              50% { transform: scale(2); opacity: 0; }
            }
          </style>
        `;
        
        userMarker.current = new maplibregl.Marker({ element: el })
          .setLngLat(currentLocation)
          .addTo(map.current);
      } else {
        // Обновляем позицию если маркер уже есть
        userMarker.current.setLngLat(currentLocation);
      }

      // Камера переместится к магазину после завершения первой фазы эхо
    }
  };

  // Анимация эхо-волны расширяющейся полукругом от местоположения до магазина
  const animateEchoAndRoute = (_coordinates: number[][], startLocation: [number, number], targetShop: Shop) => {
    if (!map.current) return;

    // Сразу начинаем перемещение камеры к магазину (2.5 секунды)
    map.current.flyTo({
      center: [targetShop.lng, targetShop.lat],
      zoom: 15,
      duration: 2500,
      essential: true
    });

    // Вычисляем угол направления от пользователя к магазину
    const calculateAngle = () => {
      const startPoint = map.current!.project(startLocation);
      const targetPoint = map.current!.project([targetShop.lng, targetShop.lat]);
      return Math.atan2(targetPoint.y - startPoint.y, targetPoint.x - startPoint.x);
    };

    // Вычисляем расстояние до магазина в пикселях
    const calculateMaxRadius = () => {
      const startPoint = map.current!.project(startLocation);
      const targetPoint = map.current!.project([targetShop.lng, targetShop.lat]);
      return Math.hypot(targetPoint.x - startPoint.x, targetPoint.y - startPoint.y);
    };

    let angle = calculateAngle();
    let maxRadius = calculateMaxRadius();

    const duration = 1250; // 1.25 секунды (ускорено на 50%)
    const startTime = performance.now();

    const animate = (currentTime: number) => {
      if (!map.current) return;

      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // Обновляем позицию и параметры при каждом кадре (на случай движения карты)
      const startPoint = map.current.project(startLocation);
      angle = calculateAngle();
      maxRadius = calculateMaxRadius();

      // Вычисляем текущий радиус волны (расширяется до магазина)
      const currentRadius = progress * maxRadius;
      
      // Обновляем позицию и размер волны с углом направления
      setEchoWave({ 
        x: startPoint.x, 
        y: startPoint.y, 
        radius: currentRadius,
        angle: angle
      });

      // Постепенно затемняем обычные дороги на 90%
      const roadLayers = [
        'roads-motorway-glow-outer',
        'roads-motorway-base',
        'roads-motorway-inner',
        'roads-motorway-vein',
        'roads-major-glow',
        'roads-major-base',
        'roads-major-inner',
        'roads-major-vein',
        'roads-minor-glow',
        'roads-minor-base',
        'roads-minor-inner',
        'roads-minor-vein'
      ];

      roadLayers.forEach(layerId => {
        if (map.current?.getLayer(layerId)) {
          // Затемняем постепенно от 60% до 6% (90% затемнение)
          map.current.setPaintProperty(
            layerId,
            'line-opacity',
            0.6 * (1 - (progress * 0.9))
          );
        }
      });

      // Затемняем все маркеры кроме выбранного
      const allMarkers = document.querySelectorAll('.map-marker');
      allMarkers.forEach((marker) => {
        const markerShopId = marker.getAttribute('data-shop-id');
        const shopIds = markerShopId?.split(',') || [];
        const containsSelectedShop = shopIds.includes(targetShop.id.toString());
        
        if (!containsSelectedShop) {
          // Затемняем невыбранные маркеры
          (marker as HTMLElement).style.opacity = (1 - (progress * 0.9)).toString();
        }
      });

      // Постепенно проявляем маршрут
      if (map.current?.getLayer('route-glow')) {
        map.current.setPaintProperty('route-glow', 'line-opacity', progress * 0.5);
      }
      if (map.current?.getLayer('route-base')) {
        map.current.setPaintProperty('route-base', 'line-opacity', progress * 0.6);
      }
      if (map.current?.getLayer('route-vein')) {
        map.current.setPaintProperty('route-vein', 'line-opacity', progress * 0.6);
      }

      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        // После завершения анимации оставляем маркеры затемнёнными
        const allMarkers = document.querySelectorAll('.map-marker');
        allMarkers.forEach((marker) => {
          const markerShopId = marker.getAttribute('data-shop-id');
          const shopIds = markerShopId?.split(',') || [];
          const containsSelectedShop = shopIds.includes(targetShop.id.toString());
          
          if (!containsSelectedShop) {
            (marker as HTMLElement).style.opacity = '0.1';
          }
        });
        
        // Запускаем обратный импульс от магазина
        animateShopResponse(startLocation, targetShop);
      }
    };

    requestAnimationFrame(animate);
  };

  // Анимация обратного импульса от магазина (бесконечная пульсация)
  const animateShopResponse = (_startLocation: [number, number], targetShop: Shop) => {
    if (!map.current) return;

    // Останавливаем предыдущую анимацию если есть
    if (shopPulseAnimationId.current !== null) {
      cancelAnimationFrame(shopPulseAnimationId.current);
    }

    const pulseDuration = 1500; // 1.5 секунды на один цикл расширения
    let pulseStartTime = performance.now();

    const animatePulse = (currentTime: number) => {
      if (!map.current) return;

      const elapsed = (currentTime - pulseStartTime) % pulseDuration;
      const progress = elapsed / pulseDuration;

      // Расширение от 0 до 150px без возврата
      const shopPoint = map.current.project([targetShop.lng, targetShop.lat]);
      const responseRadius = progress * 150;
      
      // Затухание волны по мере расширения (от 0.7 до 0)
      const fadeOpacity = 0.7 * (1 - progress);

      // Показываем расширяющийся импульс от магазина с затуханием
      setEchoWave({
        x: shopPoint.x,
        y: shopPoint.y,
        radius: responseRadius,
        angle: 0, // Полный круг
        opacity: fadeOpacity
      });

      // Продолжаем анимацию
      shopPulseAnimationId.current = requestAnimationFrame(animatePulse);
    };

    // Усиливаем проявление маршрута до максимума
    if (map.current?.getLayer('route-glow')) {
      map.current.setPaintProperty('route-glow', 'line-opacity', 0.8);
    }
    if (map.current?.getLayer('route-base')) {
      map.current.setPaintProperty('route-base', 'line-opacity', 1);
    }
    if (map.current?.getLayer('route-vein')) {
      map.current.setPaintProperty('route-vein', 'line-opacity', 1);
    }

    shopPulseAnimationId.current = requestAnimationFrame(animatePulse);
  };

  // Сброс (показать все дороги обратно)
  const resetRoute = () => {
    if (!map.current) return;

    // Останавливаем анимацию пульсации
    if (shopPulseAnimationId.current !== null) {
      cancelAnimationFrame(shopPulseAnimationId.current);
      shopPulseAnimationId.current = null;
    }

    // Убираем эхо
    setEchoWave(null);

    // Показываем дороги обратно
    toggleRoadsVisibility(true);

    // Восстанавливаем opacity для всех слоев дорог (возвращаем к базовой яркости 60%)
    const roadLayers = [
      'roads-motorway-glow-outer',
      'roads-motorway-base',
      'roads-motorway-inner',
      'roads-motorway-vein',
      'roads-major-glow',
      'roads-major-base',
      'roads-major-inner',
      'roads-major-vein',
      'roads-minor-glow',
      'roads-minor-base',
      'roads-minor-inner',
      'roads-minor-vein'
    ];

    roadLayers.forEach(layerId => {
      if (map.current?.getLayer(layerId)) {
        map.current.setPaintProperty(layerId, 'line-opacity', 0.6);
      }
    });

    // Восстанавливаем opacity всех маркеров
    const allMarkers = document.querySelectorAll('.map-marker');
    allMarkers.forEach((marker) => {
      (marker as HTMLElement).style.opacity = '1';
    });

    // Удаляем маршрут
    if (map.current.getSource('route')) {
      map.current.removeLayer('route-glow');
      map.current.removeLayer('route-base');
      map.current.removeLayer('route-vein');
      map.current.removeSource('route');
    }

    setSelectedShop(null);
    setPopupShop(null);
    setPopupPosition(null);
    setEchoWave(null);
    setSelectedCategory(null); // Сбрасываем выбранную категорию

    // Показываем все магазины города на карте
    if (shops.length > 0) {
      const bounds = new maplibregl.LngLatBounds();
      shops.forEach(shop => {
        bounds.extend([shop.lng, shop.lat]);
      });

      map.current.fitBounds(bounds, {
        padding: { top: 50, bottom: 50, left: 50, right: 50 },
        maxZoom: 13,
        duration: 1000,
        essential: true
      });
    }
  };

  // Переместить камеру к местоположению пользователя
  const flyToUserLocation = () => {
    if (!map.current || !userLocation) return;
    
    map.current.flyTo({
      center: userLocation,
      zoom: 15,
      duration: 1500,
      essential: true
    });
  };

  // Получение геолокации пользователя
  useEffect(() => {
    requestLocation()
      .then((location) => {
        setUserLocation([location.longitude, location.latitude]);
        hapticFeedback('success');
      })
      .catch(() => {
        hapticFeedback('error');
      });
  }, []);

  // useEffect для создания карты при монтировании (БЕЗ зависимости от selectedCity)
  useEffect(() => {
    if (!mapContainer.current) return;
    if (map.current) return; // Карта уже создана
    

    // Инициализация карты с показом всей России (минимальный зум)
    map.current = new maplibregl.Map({
      container: mapContainer.current,
      style: neonRoadsStyle as any,
      center: [95, 64], // Центр России (примерно Красноярск)
      zoom: 3, // Минимальный зум чтобы показать всю страну
      minZoom: 3, // Минимальный zoom
      maxZoom: 18,
      attributionControl: false
    });

    // Анимация появления карты из квадратиков
    map.current.on('load', () => {
      // Создаём пустые sources и layers для всех типов дорог сразу
      initAllRoadLayers();
      
      // Загружаем дороги через Overpass API и рисуем их неоном
      loadCityRoads();
      
      // Загружаем дороги для всех городов БЕЗ магазинов (для белых миниатюр)
      
      // Создаём межгородские дороги (белые между ВСЕМИ городами)      
      // Анимируем появление
      const canvas = pixelOverlayRef.current;
      if (!canvas) return;
      
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      
      const pixelSize = 40;
      const pixels: { x: number; y: number; delay: number }[] = [];
      
      for (let y = 0; y < canvas.height; y += pixelSize) {
        for (let x = 0; x < canvas.width; x += pixelSize) {
          pixels.push({ 
            x, 
            y, 
            delay: Math.random() * 800
          });
        }
      }
      
      const startTime = Date.now();
      
      const animatePixels = () => {
        const elapsed = Date.now() - startTime;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        let allComplete = true;
        
        pixels.forEach(pixel => {
          if (elapsed < pixel.delay) {
            allComplete = false;
            ctx.fillStyle = '#0a0a1a';
            ctx.fillRect(pixel.x, pixel.y, pixelSize, pixelSize);
          }
        });
        
        if (!allComplete) {
          requestAnimationFrame(animatePixels);
        }
      };
      
      animatePixels();
    });

    // Загружаем дороги сразу после инициализации карты (без задержки)
    map.current.once('idle', () => {
      loadCityRoads(); // Загружаем весь город целиком один раз
    });

    // Автозагрузка дорог при приближении к другому городу
    map.current.on('moveend', () => {
      if (!map.current) return;
      
      // Проверяем есть ли отложенная загрузка города
      if (pendingCityLoadRef.current) {
        const cityToLoad = pendingCityLoadRef.current;
        pendingCityLoadRef.current = null; // Сбрасываем
        loadCityRoads(cityToLoad);
        return;
      }
      
      // Пропускаем автозагрузку если это программный переход без отложенного города
      if (skipAutoLoadRef.current) {
        skipAutoLoadRef.current = false;
        return;
      }
      
      const center = map.current.getCenter();
      const zoom = map.current.getZoom();
      
      // Если приблизились достаточно (zoom > 9), проверяем ближайший город
      if (zoom > 9) {
        const nearestCity = findNearestCity([center.lng, center.lat]);
        
        if (nearestCity && nearestCity.name !== loadedCityName.current) {
          
          // loadCityRoads сам обновит selectedCity в store
          loadCityRoads(nearestCity);
        }
      }
    });

    // Добавление контролов убрано - все кастомные

    // Обработчик zoom для переключения между маркерами и city labels
    const handleZoom = () => {
      if (!map.current) return;
      const zoom = map.current.getZoom();
      
      // Обновляем state с текущим зумом
      setCurrentZoom(Math.round(zoom * 10) / 10);
      
      // Очищаем предыдущий таймер debounce
      if (zoomDebounceTimer.current) {
        clearTimeout(zoomDebounceTimer.current);
      }
      
      // При zoom < 9.6 город считается покинутым → сброс категории
      if (zoom < 9.6) {
        if (selectedCategoryRef.current) {
          setSelectedCategory(null);
        }
      }
      
      // ПОСТОЯННАЯ ЗАВИСИМОСТЬ: zoom < 9.6 → city labels, zoom >= 9.6 → маркеры
      if (zoom < 9.6) {
        // Показываем названия городов
        setShowCityLabels(true);
        // Скрываем все маркеры магазинов/категорий
        markers.current.forEach(marker => {
          const el = marker.getElement();
          el.style.display = 'none';
        });
        
        // При отдалении показываем межгородские дороги
      } else {
        // zoom >= 9.6: скрываем названия городов, маркеры станут видны через updateMarkersVisibility
        setShowCityLabels(false);
      }
      
      // Управляем видимостью белых неоновых дорог между городами без магазинов (zoom 3+)
      if (map.current.getSource('no-shops-inter-city-roads')) {
        if (zoom >= 3) {
          // Показываем белые неоновые дороги на zoom 3 и выше
          map.current.setLayoutProperty('no-shops-inter-city-roads-glow', 'visibility', 'visible');
          map.current.setLayoutProperty('no-shops-inter-city-roads', 'visibility', 'visible');
        } else {
          // Скрываем на других зумах
          map.current.setLayoutProperty('no-shops-inter-city-roads-glow', 'visibility', 'none');
          map.current.setLayoutProperty('no-shops-inter-city-roads', 'visibility', 'none');
        }
      }
      
      // Ограничиваем maxZoom для городов без магазинов
      if (selectedCity && CITIES_WITHOUT_SHOPS_VISUAL.includes(selectedCity.name)) {
        if (zoom > 11.5 && map.current.getMaxZoom() > 11.5) {
          map.current.setMaxZoom(11.5);
          map.current.setZoom(11.5);
        }
      } else {
        // Для городов с магазинами - полный zoom
        if (map.current.getMaxZoom() !== 18) {
          map.current.setMaxZoom(18);
        }
      }
    };

    map.current.on('zoom', handleZoom);
    handleZoom(); // Вызываем сразу для инициализации

    // Cleanup только при размонтировании компонента
    return () => {
      // Очищаем debounce таймер при cleanup
      if (zoomDebounceTimer.current) {
        clearTimeout(zoomDebounceTimer.current);
      }
      
      if (map.current) {
        markers.current.forEach(marker => marker.remove());
        markers.current = [];
        cityLabelsRef.current.forEach(label => label.remove());
        cityLabelsRef.current = [];
        map.current.remove();
        map.current = null;
      }
    };
  }, []); // Карта создаётся ТОЛЬКО ОДИН РАЗ при монтировании компонента

  // АВТОМАТИЧЕСКОЕ ПРИБЛИЖЕНИЕ К ГОРОДУ ПРИ ПЕРВОМ ЗАПУСКЕ
  const hasFlownToCity = useRef<boolean>(false);
  
  useEffect(() => {
    // Ждем пока и карта, и город будут готовы
    if (!map.current || !selectedCity) return;
    
    // Проверяем что карта полностью загружена
    const mapInstance = map.current;
    
    const performInitialFly = () => {
      if (hasFlownToCity.current) return;
      
      hasFlownToCity.current = true;
      
      // Летим к городу на зум 12
      mapInstance.flyTo({
        center: [selectedCity.lng, selectedCity.lat],
        zoom: 12,
        duration: 2000
      });
      
      // Загружаем дороги города
      skipAutoLoadRef.current = true;
      pendingCityLoadRef.current = selectedCity;
    };
    
    // Если карта уже загружена - летим сразу
    if (mapInstance.loaded()) {
      performInitialFly();
    } else {
      // Иначе ждем события load
      mapInstance.once('load', performInitialFly);
    }
  }, [selectedCity]);

  // Отдельный эффект для реакции на изменение selectedCity
  useEffect(() => {
    if (!map.current || !selectedCity) return;
    
    // Если это уже загруженный город - переключаемся на него
    if (cityRoadsLoaded.current[selectedCity.name]) {
      loadCityRoads(selectedCity);
      
      // Определяем zoom и maxZoom в зависимости от типа города
      const isCityWithoutShops = CITIES_WITHOUT_SHOPS_VISUAL.includes(selectedCity.name);
      const targetZoom = isCityWithoutShops ? 11 : 12;
      const newMaxZoom = isCityWithoutShops ? 11.5 : 18;
      
      // Обновляем maxZoom карты
      map.current.setMaxZoom(newMaxZoom);
      
      // Летим к городу
      map.current.flyTo({
        center: [selectedCity.lng, selectedCity.lat],
        zoom: targetZoom,
        duration: 1500
      });
    }
  }, [selectedCity]);

  // Сброс выбранной категории при смене города
  useEffect(() => {
    setSelectedCategory(null);
  }, [selectedCity]);

  // Загрузка дорог при обновлении списка cities
  // Межгородские дороги генерируются автоматически при загрузке карты
  // useEffect удален - больше не нужен

  // Создание city labels при zoom out
  useEffect(() => {
    if (!map.current || !showCityLabels) {
      // Удаляем labels если не нужны
      cityLabelsRef.current.forEach(label => label.remove());
      cityLabelsRef.current = [];
      return;
    }

    // ВАЖНО: Удаляем старые метки ПЕРЕД созданием новых
    cityLabelsRef.current.forEach(label => label.remove());
    cityLabelsRef.current = [];

    // Фильтруем города с магазинами (используем city.shops > 0, не проверяем shops.length)
    // Это важно: cities уже содержат информацию о количестве магазинов из App.tsx
    
    const citiesWithShops = cities.filter(city => {
      const hasShops = typeof city.shops === 'number' && city.shops > 0;
      return hasShops;
    });
    
    
    // Если нет городов с магазинами, просто выходим (метки уже удалены)
    if (citiesWithShops.length === 0) {
      return;
    }
    
    
    // Функция для расчета масштаба от zoom (zoom 4 = 0.5x, zoom 9 = 1x)
    const getScale = (zoom: number) => {
      const minZoom = 4;
      const maxZoom = 9.6;
      const minScale = 0.5;
      const maxScale = 1;
      const t = Math.max(0, Math.min(1, (zoom - minZoom) / (maxZoom - minZoom)));
      return minScale + (maxScale - minScale) * t;
    };
    
    const updateScales = () => {
      if (!map.current) return;
      const zoom = map.current.getZoom();
      const scale = getScale(zoom);
      const visible = zoom < 9.6; // Названия городов видны только при zoom < 9.6
      
      cityLabelsRef.current.forEach(marker => {
        const el = marker.getElement();
        if (el) {
          el.style.display = visible ? 'block' : 'none';
        }
        const innerEl = el?.querySelector('.city-label') as HTMLElement;
        if (innerEl) {
          innerEl.style.transform = `scale(${scale})`;
        }
      });
    };
    
    citiesWithShops.forEach(city => {
      const shopCount = typeof city.shops === 'number' ? city.shops : 0;
      const cityUserCount = getCount(stats, 'city', city.name);
      
      const el = document.createElement('div');
      el.className = 'city-label-wrapper';
      
      const initialScale = map.current ? getScale(map.current.getZoom()) : 0.5;
      
      el.innerHTML = `
        <div class="city-label" style="
          background: rgba(10, 10, 26, 0.95);
          border: 2px solid white;
          border-radius: 12px;
          padding: 12px 20px;
          cursor: pointer;
          box-shadow: 0 0 30px rgba(255, 255, 255, 0.5);
          transition: box-shadow 0.3s;
          font-weight: bold;
          text-align: center;
          pointer-events: auto;
          animation: cityLabelPulse 3s ease-in-out infinite;
          transform: scale(${initialScale});
          transform-origin: center center;
        ">
          <div class="city-label__name">${city.name}${getUserCounterHTML(cityUserCount)}</div>
          <div class="city-label__count">${shopCount} ${shopCount === 1 ? 'магазин' : shopCount < 5 ? 'магазина' : 'магазинов'}</div>
        </div>
      `;
      
      const innerEl = el.querySelector('.city-label') as HTMLElement;
      
      // Hover эффект только для тени, без transform
      innerEl.addEventListener('mouseenter', () => {
        innerEl.style.boxShadow = '0 0 40px rgba(255, 255, 255, 0.9)';
      });
      
      innerEl.addEventListener('mouseleave', () => {
        innerEl.style.boxShadow = '0 0 30px rgba(255, 255, 255, 0.5)';
      });
      
      const labelDiv = el.querySelector('.city-label') as HTMLElement;
      
      // Hover эффект только для тени, без transform
      labelDiv.addEventListener('mouseenter', () => {
        labelDiv.style.boxShadow = '0 0 40px rgba(255, 255, 255, 0.9)';
      });
      
      labelDiv.addEventListener('mouseleave', () => {
        labelDiv.style.boxShadow = '0 0 30px rgba(255, 255, 255, 0.5)';
      });
      
      // Клик на город
      labelDiv.addEventListener('click', () => {
        if (!map.current) return;
        
        
        // Магазины ЕСТЬ (т.к. город уже в citiesWithShops), просто переходим
        // Обновляем selectedCity через store
        const { selectCity } = useMapStore.getState();
        selectCity(city);
        
        // Устанавливаем флаг перед программным переходом
        skipAutoLoadRef.current = true;
        
        // Клик на город → зум 12 для показа категорий
        const targetZoom = 12;
        
        map.current.flyTo({
          center: [city.lng, city.lat],
          zoom: targetZoom,
          duration: 2000
        });
        
        // Устанавливаем отложенную загрузку дорог ПОСЛЕ окончания анимации
        pendingCityLoadRef.current = city;
      });

      const marker = new maplibregl.Marker({ 
        element: el,
        anchor: 'center'
      })
        .setLngLat([city.lng, city.lat])
        .addTo(map.current!);
      
      cityLabelsRef.current.push(marker);
    });
    
    // Устанавливаем начальный масштаб
    updateScales();
    
    // Подписываемся на изменение zoom
    map.current.on('zoom', updateScales);

    return () => {
      if (map.current) {
        map.current.off('zoom', updateScales);
      }
      cityLabelsRef.current.forEach(label => label.remove());
      cityLabelsRef.current = [];
    };
  }, [showCityLabels, cities, selectedCity, stats]);

  // Создание белых (потухших) city labels для городов без магазинов
  useEffect(() => {
    if (!map.current || !showCityLabels) {
      // Удаляем labels если не нужны
      whiteCityLabelsRef.current.forEach(label => label.remove());
      whiteCityLabelsRef.current = [];
      return;
    }

    // ВАЖНО: Удаляем старые метки ПЕРЕД созданием новых
    whiteCityLabelsRef.current.forEach(label => label.remove());
    whiteCityLabelsRef.current = [];

    // Вычисляем города без магазинов из текущих cities (вместо глобального массива)
    // ВАЖНО: показываем белые таблички для городов которых нет в API ИЛИ у которых shops === 0
    // Case-insensitive поиск для избежания дубликатов (Усть-илимск vs Усть-Илимск)
    const citiesFromApiMap = new Map(cities.map(c => [c.name.toLowerCase(), c]));
    
    
    const citiesWithoutShops = Object.keys(CITY_COORDS)
      .filter(cityName => {
        const cityInApi = citiesFromApiMap.get(cityName.toLowerCase());
        // ИСПРАВЛЕНО: явно проверяем что shops больше 0, иначе показываем белую табличку
        const hasShops = cityInApi && typeof cityInApi.shops === 'number' && cityInApi.shops > 0;
        const shouldShow = !hasShops; // Показываем только если НЕТ магазинов
        return shouldShow;
      })
      .map(cityName => ({
        name: cityName,
        lat: CITY_COORDS[cityName]?.lat,
        lng: CITY_COORDS[cityName]?.lng
      }))
      .filter(city => city.lat && city.lng);
    
    
    // Функция для расчета масштаба от zoom (zoom 4.6 = 0.5x, zoom 9 = 1x)
    const getScale = (zoom: number) => {
      const minZoom = 4.6;
      const maxZoom = 9.5;
      const minScale = 0.5;
      const maxScale = 1;
      const t = Math.max(0, Math.min(1, (zoom - minZoom) / (maxZoom - minZoom)));
      return minScale + (maxScale - minScale) * t;
    };
    
    const updateScales = () => {
      if (!map.current) return;
      const zoom = map.current.getZoom();
      const scale = getScale(zoom);
      
      whiteCityLabelsRef.current.forEach(marker => {
        const el = marker.getElement();
        if (!el) return;
        
        const dotEl = el.querySelector('.city-dot') as HTMLElement;
        const labelEl = el.querySelector('.city-label') as HTMLElement;
        
        // zoom 3-4.5: показываем точку, скрываем название
        // zoom 4.6+: показываем название, скрываем точку
        // zoom 9.5+: скрываем всё
        if (zoom >= 3 && zoom <= 4.5) {
          if (dotEl) dotEl.style.display = 'block';
          if (labelEl) labelEl.style.display = 'none';
        } else if (zoom > 4.5 && zoom <= 9.5) {
          if (dotEl) dotEl.style.display = 'none';
          if (labelEl) {
            labelEl.style.display = 'block';
            labelEl.style.transform = `scale(${scale})`;
          }
        } else {
          if (dotEl) dotEl.style.display = 'none';
          if (labelEl) labelEl.style.display = 'none';
        }
      });
    };
    
    citiesWithoutShops.forEach(city => {
      const el = document.createElement('div');
      el.className = 'city-label-wrapper city-label-wrapper--inactive';
      
      const initialScale = map.current ? getScale(map.current.getZoom()) : 0.5;
      const initialZoom = map.current ? map.current.getZoom() : 3;
      
      // Белая точка для zoom 3-4.5
      const dotHTML = `
        <div class="city-dot" style="
          width: 8px;
          height: 8px;
          background: white;
          border-radius: 50%;
          border: 1px solid rgba(255, 255, 255, 0.5);
          cursor: pointer;
          display: ${initialZoom >= 3 && initialZoom <= 4.5 ? 'block' : 'none'};
        "></div>
      `;
      
      // Название для zoom 4.6+
      const labelHTML = `
        <div class="city-label city-label--inactive" style="
          background: rgba(10, 10, 26, 0.21);
          border: 2px solid rgba(255, 255, 255, 0.105);
          border-radius: 12px;
          padding: 12px 20px;
          cursor: pointer;
          box-shadow: 0 0 10px rgba(255, 255, 255, 0.07);
          transition: box-shadow 0.3s, border-color 0.3s, color 0.3s;
          font-weight: bold;
          text-align: center;
          pointer-events: auto;
          color: rgba(255, 255, 255, 0.175);
          opacity: 0.7;
          transform: scale(${initialScale});
          transform-origin: center center;
          display: ${initialZoom > 4.5 && initialZoom <= 9.5 ? 'block' : 'none'};
        ">
          <div class="city-label__name">${city.name}</div>
          <div class="city-label__count">Нет магазинов</div>
        </div>
      `;
      
      el.innerHTML = dotHTML + labelHTML;
      
      const innerEl = el.querySelector('.city-label') as HTMLElement;
      
      // Hover эффект для названия
      if (innerEl) {
        innerEl.addEventListener('mouseenter', () => {
          innerEl.style.boxShadow = '0 0 20px rgba(255, 255, 255, 0.175)';
          innerEl.style.borderColor = 'rgba(255, 255, 255, 0.21)';
          innerEl.style.color = 'rgba(255, 255, 255, 0.35)';
        });
        
        innerEl.addEventListener('mouseleave', () => {
          innerEl.style.boxShadow = '0 0 10px rgba(255, 255, 255, 0.07)';
          innerEl.style.borderColor = 'rgba(255, 255, 255, 0.105)';
          innerEl.style.color = 'rgba(255, 255, 255, 0.175)';
        });
      }
      
      el.addEventListener('click', () => {
        // Показываем модальное окно вместо зума
        setShowEmptyCityModal(true);
      });

      const marker = new maplibregl.Marker({ 
        element: el,
        anchor: 'center'
      })
        .setLngLat([city.lng!, city.lat!])
        .addTo(map.current!);
      
      whiteCityLabelsRef.current.push(marker);
    });
    
    // Устанавливаем начальный масштаб
    updateScales();
    
    // Подписываемся на изменение zoom
    map.current.on('zoom', updateScales);

    return () => {
      if (map.current) {
        map.current.off('zoom', updateScales);
      }
      whiteCityLabelsRef.current.forEach(label => label.remove());
      whiteCityLabelsRef.current = [];
    };
  }, [showCityLabels, cities]);

  // Отдельный эффект для обработки кликов на карту
  useEffect(() => {
    if (!map.current) return;

    const handleMapClick = (e: any) => {
      if (isSelectingLocation) {
        const { lng, lat } = e.lngLat;
        setUserLocation([lng, lat]);
        
        // Удаляем старый маркер пользователя
        if (userMarker.current) {
          userMarker.current.remove();
        }

        // Создаем новый маркер
        const el = document.createElement('div');
        el.className = 'user-marker';
        el.innerHTML = `
          <div style="position: relative; width: 30px; height: 30px;">
            <div style="position: absolute; width: 30px; height: 30px; background: #f0f8ff; border-radius: 50%; opacity: 0.3; animation: pulse 2s infinite;"></div>
            <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 16px; height: 16px; background: #f0f8ff; border-radius: 50%; border: 3px solid white; box-shadow: 0 0 15px #f0f8ff;"></div>
            <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 8px; height: 8px; background: white; border-radius: 50%;"></div>
          </div>
          <style>
            @keyframes pulse {
              0%, 100% { transform: scale(1); opacity: 0.3; }
              50% { transform: scale(2); opacity: 0; }
            }
          </style>
        `;
        
        userMarker.current = new maplibregl.Marker({ element: el })
          .setLngLat([lng, lat])
          .addTo(map.current!);

        setIsSelectingLocation(false);
      } else if (popupShop) {
        // Закрываем popup при клике на карту
        setPopupShop(null);
        setPopupPosition(null);
      }
    };

    map.current.on('click', handleMapClick);

    // Изменяем курсор при режиме выбора
    map.current.getCanvas().style.cursor = isSelectingLocation ? 'crosshair' : '';

    return () => {
      map.current?.off('click', handleMapClick);
    };
  }, [isSelectingLocation, selectedShop, popupShop]);

  // Фильтрация магазинов по городу - используем useMemo для оптимизации
  const cityShops = useMemo(() => {
    return selectedCity ? shops.filter(shop => shop.city === selectedCity.name) : [];
  }, [selectedCity, shops]);
  
  // Вычисляем все уникальные категории в городе
  const categoriesInCity = useMemo(() => {
    const categories = new Set<string>();
    cityShops.forEach(shop => {
      categories.add(shop.category || 'Без категории');
    });
    return Array.from(categories);
  }, [cityShops]);
  
  // Группировка по категориям или фильтрация по выбранной категории
  const displayShops = useMemo(() => {
    if (!selectedCity || cityShops.length === 0) return [];
    
    // При zoom < 9.6 НЕ показываем маркеры (только надписи городов)
    if (currentZoom < 9.6) {
      return [];
    }
    
    // Если категория НЕ выбрана - показываем первый магазин каждой категории (для выбора)
    if (!selectedCategory) {
      const categoryMap = new Map<string, Shop>();
      cityShops.forEach(shop => {
        const category = shop.category || 'Без категории';
        if (!categoryMap.has(category)) {
          categoryMap.set(category, shop);
        }
      });
      return Array.from(categoryMap.values());
    }
    
    // Если выбрана конкретная категория - показываем все магазины этой категории
    return cityShops.filter(shop => shop.category === selectedCategory);
  }, [selectedCity, cityShops, selectedCategory, currentZoom]);
  

  useEffect(() => {
    if (!map.current || displayShops.length === 0) {
      markers.current.forEach(marker => marker.remove());
      markers.current = [];
      return;
    }

    // Удаление старых маркеров
    markers.current.forEach(marker => marker.remove());
    markers.current = [];

    // Кластеризация магазинов по координатам
    const clusters = new Map<string, Shop[]>();
    const clusterRadius = 0.0005; // ~50 метров


    displayShops.forEach(shop => {
      let foundCluster = false;
      
      for (const [key, cluster] of clusters.entries()) {
        const [clusterLat, clusterLng] = key.split(',').map(Number);
        const dist = Math.hypot(shop.lat - clusterLat, shop.lng - clusterLng);
        
        if (dist < clusterRadius) {
          cluster.push(shop);
          foundCluster = true;
          break;
        }
      }
      
      if (!foundCluster) {
        clusters.set(`${shop.lat},${shop.lng}`, [shop]);
      }
    });

    // Добавление маркеров для кластеров
    clusters.forEach((clusterShops, key) => {
      const [lat, lng] = key.split(',').map(Number);
      
      if (clusterShops.length === 1) {
        // Одиночный магазин
        const shop = clusterShops[0];
        
        const el = document.createElement('div');
        el.className = 'map-marker';
        el.setAttribute('data-shop-id', shop.id.toString());
        
        // Динамический размер карточки на основе zoom
        const zoom = map.current?.getZoom() || 13;
        
        // Масштабирование: минимальный размер при zoom 10, полный при zoom 17+
        const baseScale = Math.max(0, Math.min(1, (zoom - 10) / 7)); // От 0 при zoom 10 до 1 при zoom 17
        const scale = 0.5 + baseScale * 1.6; // От 0.5 до 2.1
        const fontSize = Math.floor((10 + baseScale * 2) * 3 * 0.7 / 2);
        const padding = Math.floor(3 + baseScale * 3);
        
        // Названия всегда видны
        const labelOpacity = 1;
        const labelDisplay = 'block';
        
        // Определяем текст маркера: категория или название магазина
        const isCategoryMode = !selectedCategory;
        const markerText = isCategoryMode ? (shop.category || 'Без категории') : shop.name;
        
        // Получаем счетчик пользователей
        const shopUserCount = isCategoryMode 
          ? getCount(stats, 'category', `${shop.city}|${shop.category || 'Без категории'}`)
          : getCount(stats, 'shop', shop.id);
        
        el.innerHTML = `
          <div class="shop-label" style="
            position: absolute;
            bottom: 35px;
            left: 50%;
            transform: translateX(-50%) scale(${scale});
            background: rgba(0, 0, 0, 0.1);
            backdrop-filter: blur(10px);
            color: #f0f8ff;
            padding: ${padding}px ${padding * 2}px;
            border-radius: 5px;
            border: 1px solid rgba(255, 255, 255, 0.8);
            white-space: nowrap;
            font-size: ${fontSize}px;
            font-weight: 300;
            box-shadow: 0 0 10px rgba(240, 248, 255, 0.4);
            pointer-events: auto;
            cursor: pointer;
            max-width: 150px;
            overflow: hidden;
            text-overflow: ellipsis;
            opacity: ${labelOpacity};
            display: ${labelDisplay};
            transition: opacity 0.3s ease;
          ">
            ${markerText}${getUserCounterHTML(shopUserCount)}
          </div>
          <div class="map-marker__glow"></div>
          <div class="map-marker__dot" style="background: rgba(240, 248, 255, ${shop.activity || 0.7}); box-shadow: 0 0 15px rgba(240, 248, 255, ${shop.activity || 0.7})"></div>
          <div class="map-marker__pulse"></div>
        `;
        
        const handleShopClick = async (e: Event) => {
          e.stopPropagation();
          
          // Проверяем актуальное значение категории в момент клика
          const currentCategoryMode = !selectedCategoryRef.current;
          
          // Если это режим категорий - выбираем категорию вместо открытия магазина
          if (currentCategoryMode) {
            const category = shop.category || 'Без категории';
            setSelectedCategory(category);
            return;
          }
          
          // Показываем popup с карточкой магазина БЕЗ зума и импульса
          const point = map.current!.project([shop.lng, shop.lat]);
          setPopupPosition({ x: point.x, y: point.y });
          setPopupShop(shop);
        };
        
        el.addEventListener('click', handleShopClick);
        
        // Добавляем обработчик клика на окошко с названием
        const labelElement = el.querySelector('.shop-label');
        if (labelElement) {
          labelElement.addEventListener('click', handleShopClick);
        }

        const marker = new maplibregl.Marker({ 
          element: el,
          anchor: 'center',
          offset: [0, 0]
        })
          .setLngLat([shop.lng, shop.lat])
          .addTo(map.current!);

        markers.current.push(marker);
      } else {
        // Кластер из нескольких магазинов
        const el = document.createElement('div');
        el.className = 'map-marker map-marker--cluster';
        // Добавляем все ID магазинов из кластера через запятую
        el.setAttribute('data-shop-id', clusterShops.map(s => s.id).join(','));
        el.innerHTML = `
          <div class="map-marker__cluster-bg"></div>
          <div class="map-marker__cluster-count">${clusterShops.length}</div>
          <div class="map-marker__pulse"></div>
        `;
        
        el.addEventListener('click', async (e) => {
          e.stopPropagation();
          
          // Центрируем камеру на кластере
          if (map.current) {
            map.current.flyTo({
              center: [lng, lat],
              zoom: 15,
              duration: 1000
            });
          }
          
          const currentLocation = userLocationRef.current;
          if (!currentLocation) {
            // Если нет местоположения - просто показываем список
            setClusterShops(clusterShops);
            return;
          }
          
          // Находим ближайший магазин из кластера
          let nearestShop = clusterShops[0];
          let minDistance = Math.hypot(
            nearestShop.lat - currentLocation[1],
            nearestShop.lng - currentLocation[0]
          );
          
          clusterShops.forEach(shop => {
            const distance = Math.hypot(
              shop.lat - currentLocation[1],
              shop.lng - currentLocation[0]
            );
            if (distance < minDistance) {
              minDistance = distance;
              nearestShop = shop;
            }
          });
          
          // Строим маршрут к ближайшему
          setSelectedShop(nearestShop);
          await showRouteToShop(nearestShop, currentLocation);
          
          // И показываем список для выбора другого
          setClusterShops(clusterShops);
        });

        const marker = new maplibregl.Marker({ 
          element: el,
          anchor: 'center',
          offset: [0, 0]
        })
          .setLngLat([lng, lat])
          .addTo(map.current!);

        markers.current.push(marker);
      }
    });

    // Функция для обновления видимости маркеров на основе zoom с проверкой расстояний
    const updateMarkersVisibility = () => {
      if (!map.current) return;
      const zoom = map.current.getZoom();
      // Маркеры категорий/магазинов видны только при zoom >= 9.6
      const visible = zoom >= 9.6;
      
      // Собираем позиции всех маркеров на экране
      const markerPositions: { marker: maplibregl.Marker; screenX: number; screenY: number; label: HTMLElement | null }[] = [];
      
      markers.current.forEach(marker => {
        const el = marker.getElement();
        if (el) {
          // Применяем видимость: показываем только если zoom > 9.5
          el.style.display = visible ? 'block' : 'none';
          
          // Названия всегда видны, только масштабируются
          const baseScale = Math.max(0, Math.min(1, (zoom - 10) / 7));
          const scale = 0.5 + baseScale * 1.6;
          const fontSize = Math.floor((10 + baseScale * 2) * 3 * 0.7 / 2);
          const padding = Math.floor(3 + baseScale * 3);
          const labelOpacity = 1;
          const labelDisplay = 'block';
          
          const label = el.querySelector('.shop-label') as HTMLElement;
          if (label) {
            label.style.transform = `translateX(-50%) scale(${scale})`;
            label.style.fontSize = `${fontSize}px`;
            label.style.padding = `${padding}px ${padding * 2}px`;
            label.style.opacity = String(labelOpacity);
            label.style.display = labelDisplay;
            
            // Сохраняем позицию для проверки перекрытий
            const lngLat = marker.getLngLat();
            const screenPos = map.current!.project([lngLat.lng, lngLat.lat]);
            markerPositions.push({
              marker,
              screenX: screenPos.x,
              screenY: screenPos.y,
              label
            });
          }
        }
      });
      
      // Проверяем расстояния между маркерами и скрываем те, что слишком близко (при любом зуме)
      if (zoom >= 10) {
        // Минимальное расстояние между названиями в пикселях (зависит от зума)
        const minDistance = Math.max(50, 150 - (zoom - 10) * 10); // От 150px при зуме 10 до 50px при зуме 20
        
        markerPositions.forEach((pos1, i) => {
          if (!pos1.label || pos1.label.style.display === 'none') return;
          
          markerPositions.forEach((pos2, j) => {
            if (i >= j) return; // Проверяем только уникальные пары
            if (!pos2.label || pos2.label.style.display === 'none') return;
            
            // Вычисляем расстояние между маркерами на экране
            const distance = Math.hypot(pos2.screenX - pos1.screenX, pos2.screenY - pos1.screenY);
            
            // Если магазины слишком близко - скрываем название у второго
            if (distance < minDistance) {
              pos2.label.style.opacity = '0';
            }
          });
        });
      }
    };

    // Начальная установка видимости
    updateMarkersVisibility();

    // Обновление при изменении zoom
    map.current.on('zoom', updateMarkersVisibility);

    return () => {
      markers.current.forEach(marker => marker.remove());
      markers.current = [];
      map.current?.off('zoom', updateMarkersVisibility);
    };
  }, [displayShops, onShopClick, currentZoom, selectedCategory, stats]);

  // Отдельный useEffect для применения затемнения при выборе магазина
  useEffect(() => {
    if (!selectedShop) return;
    
    // Задержка чтобы маркеры успели пересоздаться после смены категории
    const timer = setTimeout(() => {
      // Применяем затемнение к маркерам
      const allMarkers = document.querySelectorAll('.map-marker');
      
      allMarkers.forEach((marker) => {
        const markerShopId = marker.getAttribute('data-shop-id');
        const shopIds = markerShopId?.split(',') || [];
        const containsSelectedShop = shopIds.includes(selectedShop.id.toString());
        
        
        if (!containsSelectedShop) {
          (marker as HTMLElement).style.opacity = '0.1';
        } else {
          (marker as HTMLElement).style.opacity = '1';
        }
      });
    }, 150); // Увеличил задержку до 150мс
    
    return () => clearTimeout(timer);
  }, [selectedShop, cityShops]);

  return (
    <>
      <div ref={mapContainer} className="map-view" />
      
      {/* Индикатор зума */}
      {!selectedShop && !isShopInfoOpen && (
        <div style={{
          position: 'absolute',
          top: '20px',
          left: '20px',
          background: 'rgba(255, 255, 255, 0.15)',
          backdropFilter: 'blur(15px)',
          border: '1.5px solid rgba(255, 255, 255, 0.8)',
          color: '#fff',
          padding: '8px 16px',
          borderRadius: '10px',
          fontFamily: 'monospace',
          fontSize: '14px',
          fontWeight: '400',
          boxShadow: '0 0 20px rgba(255, 255, 255, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.2)',
          zIndex: 1000,
          pointerEvents: 'none',
          userSelect: 'none',
          textShadow: '0 0 10px rgba(255, 255, 255, 0.8)'
        }}>
          Zoom: {currentZoom.toFixed(1)}
        </div>
      )}
      
      {/* Оверлей для анимации появления карты */}
      <canvas 
        ref={pixelOverlayRef} 
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          pointerEvents: 'none',
          zIndex: 10000
        }}
      />
      
      {/* Фильтр категорий УДАЛЕН - показываются все магазины города */}

      {/* Кнопка возврата к местоположению */}
      {userLocation && !isSelectingLocation && (
        <button 
          className="fly-to-location-btn"
          onClick={flyToUserLocation}
          style={{
            position: 'absolute',
            top: '80px',
            left: '20px',
            padding: '12px 20px',
            background: 'rgba(240, 248, 255, 0.9)',
            border: 'none',
            borderRadius: '8px',
            color: '#000',
            fontWeight: 'bold',
            cursor: 'pointer',
            zIndex: 1000,
            boxShadow: '0 0 20px rgba(240, 248, 255, 0.5)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
        >
          🎯 Моё местоположение
        </button>
      )}

      {/* Подсказка при выборе местоположения */}
      {isSelectingLocation && (
        <div
          style={{
            position: 'absolute',
            top: '20px',
            left: '50%',
            transform: 'translateX(-50%)',
            padding: '12px 24px',
            background: 'rgba(240, 248, 255, 0.95)',
            border: 'none',
            borderRadius: '8px',
            color: '#000',
            fontWeight: 'bold',
            zIndex: 1000,
            boxShadow: '0 0 20px rgba(240, 248, 255, 0.5)',
            textAlign: 'center'
          }}
        >
          👆 Нажмите на карту, чтобы указать ваше местоположение
          <button
            onClick={() => setIsSelectingLocation(false)}
            style={{
              marginLeft: '15px',
              padding: '4px 12px',
              background: '#000',
              color: '#f0f8ff',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            Отмена
          </button>
        </div>
      )}
      
      {/* Кнопка сброса маршрута */}
      {selectedShop && (
        <button 
          className="reset-route-btn"
          onClick={resetRoute}
          style={{
            position: 'absolute',
            top: '20px',
            left: '20px',
            padding: '12px 20px',
            background: 'rgba(240, 248, 255, 0.9)',
            border: 'none',
            borderRadius: '8px',
            color: '#000',
            fontWeight: 'bold',
            cursor: 'pointer',
            zIndex: 1000,
            boxShadow: '0 0 20px rgba(240, 248, 255, 0.5)'
          }}
        >
          ← Показать все дороги
        </button>
      )}

      {/* Кнопка выбора города */}
      {!selectedShop && !isSelectingLocation && !isShopInfoOpen && (
        <button 
          className="city-selector-btn"
          onClick={() => setShowCitySelector(true)}
          style={{
            position: 'absolute',
            top: '20px',
            right: '20px',
            padding: '12px 20px',
            background: 'rgba(255, 255, 255, 0.15)',
            backdropFilter: 'blur(15px)',
            border: '2px solid rgba(255, 255, 255, 0.8)',
            borderRadius: '12px',
            color: '#fff',
            fontWeight: '400',
            cursor: 'pointer',
            zIndex: 1000,
            boxShadow: '0 0 20px rgba(255, 255, 255, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.3)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            textShadow: '0 0 10px rgba(255, 255, 255, 0.8)'
          }}
        >
          {selectedCity ? selectedCity.name : 'ВОЙТИ В ГОРОД'}
        </button>
      )}
      
      {/* Радиальный акселератор категорий */}
      {!selectedShop && !isSelectingLocation && !isShopInfoOpen && categoriesInCity.length > 1 && currentZoom >= 9.6 && (
        <CategoryModal
          categories={categoriesInCity}
          selectedCategory={selectedCategory}
          cityName={selectedCity?.name}
          onSelectCategory={(category) => {
            setSelectedCategory(category);
          }}
          onClose={() => {
            // Закрытие означает возврат к выбору категорий
            setSelectedCategory(null);
          }}
        />
      )}
      
      {/* Эхо-волна визуализация (полукруг для прямого импульса, круг для обратного) */}
      {echoWave && (
        <div
          style={{
            position: 'absolute',
            left: `${echoWave.x}px`,
            top: `${echoWave.y}px`,
            pointerEvents: 'none',
            zIndex: 1500,
            transform: `rotate(${echoWave.angle}rad)`
          }}
        >
          {/* Основной круг/полукруг */}
          <div
            style={{
              position: 'absolute',
              width: `${echoWave.radius * 2}px`,
              height: `${echoWave.radius * 2}px`,
              marginLeft: `-${echoWave.radius}px`,
              marginTop: `-${echoWave.radius}px`,
              borderRadius: '50%',
              border: '5px solid white',
              boxShadow: '0 0 40px #f0f8ff, inset 0 0 40px rgba(240, 248, 255, 0.3)',
              opacity: echoWave.opacity ?? 0.7,
              // Если angle === 0, показываем полный круг (обратный импульс), иначе полукруг
              clipPath: echoWave.angle === 0 ? 'none' : 'polygon(50% 50%, 50% 0%, 100% 0%, 100% 100%, 50% 100%)'
            }}
          />
          {/* Второй круг/полукруг с задержкой */}
          <div
            style={{
              position: 'absolute',
              width: `${Math.max(0, echoWave.radius * 2 - 30)}px`,
              height: `${Math.max(0, echoWave.radius * 2 - 30)}px`,
              marginLeft: `-${Math.max(0, echoWave.radius - 15)}px`,
              marginTop: `-${Math.max(0, echoWave.radius - 15)}px`,
              borderRadius: '50%',
              border: '4px solid #ff8c00',
              boxShadow: '0 0 30px #ff8c00',
              opacity: (echoWave.opacity ?? 0.7) * 0.85,
              clipPath: echoWave.angle === 0 ? 'none' : 'polygon(50% 50%, 50% 0%, 100% 0%, 100% 100%, 50% 100%)'
            }}
          />
          {/* Лучи эхолокации (только для направленного импульса) */}
          {echoWave.angle !== 0 && (
            <>
              <div
                style={{
                  position: 'absolute',
                  width: `${echoWave.radius}px`,
                  height: '3px',
                  marginTop: '-1.5px',
                  background: 'linear-gradient(to right, #f0f8ff, transparent)',
                  boxShadow: '0 0 15px #f0f8ff',
                  opacity: 0.8
                }}
              />
              <div
                style={{
                  position: 'absolute',
                  width: `${echoWave.radius}px`,
                  height: '2px',
                  marginTop: '-1px',
                  background: 'linear-gradient(to right, #f0f8ff, transparent)',
                  boxShadow: '0 0 10px #f0f8ff',
                  opacity: 0.6,
                  transform: 'rotate(30deg)',
                  transformOrigin: 'left center'
                }}
              />
              <div
                style={{
                  position: 'absolute',
                  width: `${echoWave.radius}px`,
                  height: '2px',
                  marginTop: '-1px',
                  background: 'linear-gradient(to right, #f0f8ff, transparent)',
                  boxShadow: '0 0 10px #f0f8ff',
                  opacity: 0.6,
                  transform: 'rotate(-30deg)',
                  transformOrigin: 'left center'
                }}
              />
            </>
          )}
          {/* Центральная точка излучения */}
          <div
            style={{
              position: 'absolute',
              width: '25px',
              height: '25px',
              marginLeft: '-12.5px',
              marginTop: '-12.5px',
              borderRadius: '50%',
              background: 'radial-gradient(circle, #f0f8ff, rgba(240, 248, 255, 0))',
              boxShadow: '0 0 40px #f0f8ff',
              animation: 'echoPulse 0.4s ease-in-out infinite'
            }}
          />
          <style>{`
            @keyframes echoPulse {
              0%, 100% {
                transform: scale(1);
                opacity: 1;
              }
              50% {
                transform: scale(1.4);
                opacity: 0.6;
              }
            }
          `}</style>
        </div>
      )}
      
      {/* Popup карточка магазина */}
      {popupShop && popupPosition && (
        <>
          {/* Убрали оверлей - теперь можно управлять камерой при открытом popup */}
          <div
            className="shop-popup"
            style={{
              position: 'absolute',
              left: `${popupPosition.x}px`,
              top: `${popupPosition.y - 210}px`,
              transform: 'translateX(-50%)',
              background: 'rgba(30, 30, 30, 0.1)',
              border: '1px solid white',
              borderRadius: '6px',
              padding: '8px',
              minWidth: '125px',
              maxWidth: '150px',
              zIndex: 2000,
              boxShadow: '0 0 15px rgba(240, 248, 255, 0.5)',
              backdropFilter: 'blur(10px)'
            }}
            onClick={(e) => e.stopPropagation()}
          >
          <button
            onClick={() => {
              setPopupShop(null);
              setPopupPosition(null);
            }}
            style={{
              position: 'absolute',
              top: '4px',
              right: '4px',
              background: 'transparent',
              border: 'none',
              color: '#f0f8ff',
              fontSize: '14px',
              cursor: 'pointer',
              padding: '0',
              width: '16px',
              height: '16px',
              lineHeight: '16px'
            }}
          >
            ×
          </button>
          
          {popupShop.photo_url && (
            <div style={{
              width: '100%',
              borderRadius: '4px',
              overflow: 'hidden',
              marginBottom: '6px',
              border: '1px solid white',
              boxShadow: '0 0 8px rgba(255, 255, 255, 0.3)'
            }}>
              <img
                src={`https://raw.githubusercontent.com/chronosphere777/chronosphere/main/frontend/images/${popupShop.photo_url}`}
                alt={popupShop.name}
                style={{
                  width: '100%',
                  height: 'auto',
                  maxHeight: '150px',
                  objectFit: 'contain',
                  display: 'block'
                }}
              />
            </div>
          )}
          
          <h3 style={{ 
            color: '#f0f8ff', 
            margin: '0 0 4px 0',
            fontSize: '11px',
            paddingRight: '16px'
          }}>
            {popupShop.name}
          </h3>
          
          {popupShop.city && (
            <div style={{ 
              color: '#aaa', 
              marginBottom: '4px',
              fontSize: '9px'
            }}>
              {popupShop.city}
            </div>
          )}
          
          {popupShop.description && (
            <div style={{ 
              color: '#f0f8ff', 
              marginBottom: '6px',
              fontSize: '8px',
              lineHeight: '1.3',
              opacity: 0.9
            }}>
              {popupShop.description}
            </div>
          )}
          
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              hapticFeedback('light');
              
              // Сохраняем магазин ДО любых изменений состояния
              const shopToOpen = popupShop;
              
              // Останавливаем анимацию пульсации
              if (shopPulseAnimationId.current !== null) {
                cancelAnimationFrame(shopPulseAnimationId.current);
                shopPulseAnimationId.current = null;
              }
              
              // Убираем эхо
              setEchoWave(null);
              
              // Закрываем popup
              setPopupShop(null);
              setPopupPosition(null);
              
              // Открываем каталог с сохраненным магазином
              if (shopToOpen && onShopClick) {
                onShopClick(shopToOpen);
              }
            }}
            style={{
              width: '100%',
              padding: '6px',
              background: 'linear-gradient(135deg, #ff8c00, #cc6600)',
              border: 'none',
              borderRadius: '4px',
              color: 'white',
              fontWeight: 'bold',
              cursor: 'pointer',
              fontSize: '10px',
              boxShadow: '0 2px 8px rgba(255, 140, 0, 0.4)',
              transition: 'all 0.3s'
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.transform = 'scale(1.05)';
              e.currentTarget.style.boxShadow = '0 6px 20px rgba(255, 140, 0, 0.6)';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.transform = 'scale(1)';
              e.currentTarget.style.boxShadow = '0 4px 15px rgba(255, 140, 0, 0.4)';
            }}
          >
            Открыть
          </button>
        </div>
        </>
      )}
      
      {clusterShops && (
        <div className="cluster-modal" onClick={() => setClusterShops(null)}>
          <div className="cluster-modal__content" onClick={(e) => e.stopPropagation()}>
            <div className="cluster-modal__header">
              <button className="cluster-modal__back" onClick={() => setClusterShops(null)}>←</button>
              <h3>Магазины ({clusterShops.length})</h3>
              <div style="width: 40px"></div>
            </div>
            <div className="cluster-modal__shops">
              {clusterShops.map((shop) => {
                const photoUrl = shop.photo_url 
                  ? `https://raw.githubusercontent.com/chronosphere777/chronosphere/main/frontend/images/${shop.photo_url}`
                  : null;
                
                return (
                  <div 
                    key={shop.id} 
                    className="cluster-shop-card"
                    onClick={async () => {
                      hapticFeedback('medium');
                      const currentLocation = userLocationRef.current;
                      if (!currentLocation) {
                        hapticFeedback('error');
                        alert('Сначала укажите ваше местоположение на карте');
                        return;
                      }
                      setClusterShops(null);
                      setSelectedShop(shop);
                      hapticFeedback('success');
                      await showRouteToShop(shop, currentLocation);
                    }}
                  >
                    {photoUrl && (
                      <div className="cluster-shop-card__photo">
                        <img src={photoUrl} alt={shop.name} />
                      </div>
                    )}
                    <div className="cluster-shop-card__info">
                      <h3>{shop.name}</h3>
                      {shop.city && <div className="cluster-shop-card__city">{shop.city}</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Модал выбора города */}
      {showCitySelector && (
        <CityModal
          cities={cities.filter(city => typeof city.shops === 'number' && city.shops > 0).map(city => ({
            name: city.name,
            coords: [city.lng, city.lat] as [number, number]
          }))}
          onSelectCity={(city) => {
            
            // Находим полный объект города
            const fullCity = cities.find(c => c.name === city.name);
            if (!fullCity) return;
            
            // Обновляем selectedCity через store
            const { selectCity } = useMapStore.getState();
            selectCity(fullCity);
            
            // Зумим к городу
            if (map.current) {
              skipAutoLoadRef.current = true;
              const targetZoom = 12;
              
              map.current.flyTo({
                center: [fullCity.lng, fullCity.lat],
                zoom: targetZoom,
                duration: 2000
              });
              
              pendingCityLoadRef.current = fullCity;
            }
          }}
          onClose={() => setShowCitySelector(false)}
        />
      )}
      
      {/* Модал для города без магазинов */}
      {showEmptyCityModal && (
        <div 
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            background: 'rgba(0, 0, 0, 0.8)',
            backdropFilter: 'blur(10px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999
          }}
          onClick={() => setShowEmptyCityModal(false)}
        >
          <div 
            style={{
              background: 'rgba(30, 30, 30, 0.95)',
              backdropFilter: 'blur(20px)',
              border: '2px solid rgba(255, 255, 255, 0.3)',
              borderRadius: '20px',
              padding: '32px',
              maxWidth: '400px',
              textAlign: 'center',
              boxShadow: '0 0 40px rgba(255, 255, 255, 0.2)'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{
              fontSize: '48px',
              marginBottom: '16px'
            }}>😔</div>
            
            <h2 style={{
              color: '#f0f8ff',
              fontSize: '24px',
              marginBottom: '16px',
              fontWeight: '600'
            }}>
              В этом городе пока нет магазинов
            </h2>
            
            <p style={{
              color: 'rgba(240, 248, 255, 0.8)',
              fontSize: '16px',
              lineHeight: '1.6',
              marginBottom: '24px'
            }}>
              Если вы хотите присоединиться к нашей сети — напишите нам!
            </p>
            
            <a 
              href="https://t.me/chronosphereadmin"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'inline-block',
                padding: '12px 32px',
                background: 'linear-gradient(135deg, #0088cc, #005580)',
                border: 'none',
                borderRadius: '12px',
                color: '#fff',
                fontSize: '16px',
                fontWeight: 'bold',
                textDecoration: 'none',
                cursor: 'pointer',
                boxShadow: '0 4px 20px rgba(0, 136, 204, 0.4)',
                transition: 'all 0.3s ease',
                marginBottom: '16px'
              }}
              onMouseEnter={(e) => {
                const target = e.target as HTMLElement;
                target.style.transform = 'scale(1.05)';
                target.style.boxShadow = '0 6px 30px rgba(0, 136, 204, 0.6)';
              }}
              onMouseLeave={(e) => {
                const target = e.target as HTMLElement;
                target.style.transform = 'scale(1)';
                target.style.boxShadow = '0 4px 20px rgba(0, 136, 204, 0.4)';
              }}
            >
              @chronosphereadmin
            </a>
            
            <button
              onClick={() => setShowEmptyCityModal(false)}
              style={{
                display: 'block',
                width: '100%',
                padding: '12px',
                background: 'rgba(255, 255, 255, 0.1)',
                border: '1px solid rgba(255, 255, 255, 0.3)',
                borderRadius: '12px',
                color: '#f0f8ff',
                fontSize: '14px',
                cursor: 'pointer',
                transition: 'all 0.2s ease'
              }}
              onMouseEnter={(e) => {
                const target = e.target as HTMLElement;
                target.style.background = 'rgba(255, 255, 255, 0.2)';
              }}
              onMouseLeave={(e) => {
                const target = e.target as HTMLElement;
                target.style.background = 'rgba(255, 255, 255, 0.1)';
              }}
            >
              Закрыть
            </button>
          </div>
        </div>
      )}
    </>
  );
}