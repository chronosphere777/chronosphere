import { useState, useEffect } from 'preact/hooks';
import { api } from '../api/client';

// API base URL
const API_BASE = 'https://chronosphere7777.pythonanywhere.com';

// Функция для проксирования Google Drive изображений
const getProxiedImageUrl = (url: string | null): string | null => {
  if (!url) return null;
  
  // Если это Google Drive URL - проксируем через наш сервер
  if (url.includes('drive.google.com')) {
    return `${API_BASE}/api/proxy-image?url=${encodeURIComponent(url)}`;
  }
  
  // Если это GitHub raw URL - оставляем как есть
  return url;
};

interface WholesaleCatalogProps {
  cityName: string;
  onClose: () => void;
}

interface WholesaleProduct {
  category_path: string;
  size_color: string | null;
  size_color_label: string;
  price: string | null;
  photo_url: string | null;
  description: string | null;
  row_index: number;
}

type CategoryItem = { path: string; isLeaf: false };
type ProductItem = { path: string; product: WholesaleProduct; isLeaf: true };
type ListItem = CategoryItem | ProductItem;

export function WholesaleCatalog({ cityName, onClose }: WholesaleCatalogProps) {
  const [products, setProducts] = useState<WholesaleProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPath, setCurrentPath] = useState<string>('');
  const [breadcrumbs, setBreadcrumbs] = useState<string[]>([]);
  const [fullscreenImage, setFullscreenImage] = useState<string | null>(null);

  useEffect(() => {
    // Загрузка каталога ОПТ
    api.getWholesaleShops().then(data => {
      console.log('ОПТ данные:', data);
      console.log('Товаров загружено:', data.products?.length || 0);
      setProducts(data.products || []);
      setLoading(false);
    }).catch((error) => {
      console.error('Ошибка загрузки ОПТ:', error);
      setLoading(false);
    });
  }, []);

  // Получить уникальные пути на текущем уровне
  const getCurrentLevelItems = (): ListItem[] => {
    if (!currentPath) {
      // Корневой уровень - показываем первый уровень категорий
      const uniquePaths = new Set<string>();
      products.forEach(p => {
        const firstLevel = p.category_path.split(' > ')[0];
        if (firstLevel) uniquePaths.add(firstLevel);
      });
      return Array.from(uniquePaths).map(path => ({ path, isLeaf: false }));
    }

    // Сначала проверяем есть ли подкатегории
    const uniquePaths = new Set<string>();
    const currentDepth = currentPath.split(' > ').length;
    
    products.forEach(p => {
      if (p.category_path.startsWith(currentPath + ' > ')) {
        const pathParts = p.category_path.split(' > ');
        if (pathParts.length > currentDepth) {
          const nextLevelPath = pathParts.slice(0, currentDepth + 1).join(' > ');
          uniquePaths.add(nextLevelPath);
        }
      }
    });

    // Если есть подкатегории - показываем их
    if (uniquePaths.size > 0) {
      return Array.from(uniquePaths).map(path => ({ path, isLeaf: false }));
    }

    // Если подкатегорий нет - показываем товары с точным совпадением пути
    const exactMatches = products.filter(p => p.category_path === currentPath);
    if (exactMatches.length > 0) {
      return exactMatches.map(p => ({ path: currentPath, product: p, isLeaf: true }));
    }

    return [];
  };

  // Подсчет товаров в категории
  const countProducts = (path: string) => {
    return products.filter(p => p.category_path.startsWith(path)).length;
  };

  const handleBack = () => {
    if (breadcrumbs.length === 0) {
      onClose();
    } else {
      const newBreadcrumbs = [...breadcrumbs];
      newBreadcrumbs.pop();
      setBreadcrumbs(newBreadcrumbs);
      setCurrentPath(newBreadcrumbs.join(' > '));
    }
  };

  const handleNavigate = (path: string) => {
    const pathParts = path.split(' > ');
    setBreadcrumbs(pathParts);
    setCurrentPath(path);
  };

  const renderItems = () => {
    const items = getCurrentLevelItems();

    if (items.length === 0) {
      return <div className="empty-state">Товары не найдены</div>;
    }

    return items.map((item, index) => {
      if (item.isLeaf && item.product) {
        // Рендерим товар
        const product = item.product;
        return (
          <div key={index} className="product-card">
            {product.photo_url && (
              <img 
                src={getProxiedImageUrl(product.photo_url) || ''} 
                alt="" 
                className="product-image" 
                onClick={(e) => {
                  e.stopPropagation();
                  setFullscreenImage(product.photo_url);
                }}
                style={{ cursor: 'pointer' }}
              />
            )}
            <div className="product-info">
              {product.size_color && (
                <div className="product-detail">
                  {product.size_color_label || 'Размер/Цвет'}: {product.size_color}
                </div>
              )}
              {product.price && (
                <div className="product-price">Цена: {product.price} ₽</div>
              )}
              {product.description && (
                <div className="product-description">{product.description}</div>
              )}
            </div>
          </div>
        );
      } else {
        // Рендерим категорию
        const displayName = item.path.split(' > ').pop() || item.path;
        const count = countProducts(item.path);
        return (
          <div 
            key={item.path} 
            className="category-card" 
            onClick={() => handleNavigate(item.path)}
          >
            <h3>{displayName}</h3>
            <div className="count">{count} {count === 1 ? 'товар' : 'товаров'}</div>
          </div>
        );
      }
    });
  };

  if (loading) {
    return (
      <div className="shop-info-modal">
        <div className="shop-info-content">
          <div className="loading">Загрузка...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="shop-info-modal">
      <div className="shop-info-content" style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%'
      }}>
        
        {/* Заголовок каталога ОПТ */}
        <div style={{
          flexShrink: 0,
          background: 'transparent',
          paddingBottom: '8px',
          paddingTop: '8px'
        }}>
          <div style={{
            background: 'rgba(255, 215, 0, 0.1)',
            border: '2px solid rgba(255, 215, 0, 0.6)',
            borderRadius: '12px',
            padding: '16px',
            margin: '8px 8px 8px 8px',
            boxShadow: '0 0 20px rgba(255, 215, 0, 0.3)',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px'
          }}>
            <h3 style={{ 
              color: '#FFD700', 
              margin: '0',
              fontSize: '18px',
              textAlign: 'center',
              textShadow: '0 0 8px rgba(255, 215, 0, 0.5)'
            }}>
              Оптовый каталог
            </h3>
            
            <div style={{ 
              color: '#FFA500', 
              fontSize: '14px',
              textAlign: 'center',
              opacity: 0.9
            }}>
              {cityName}
            </div>
          </div>
          
          {breadcrumbs.length > 0 && (
            <div className="breadcrumbs">
              <span onClick={() => { setBreadcrumbs([]); setCurrentPath(''); }}>Главная</span>
              {breadcrumbs.map((crumb, i) => (
                <span key={i}>
                  {' > '}
                  <span onClick={() => {
                    const newBreadcrumbs = breadcrumbs.slice(0, i + 1);
                    setBreadcrumbs(newBreadcrumbs);
                    setCurrentPath(newBreadcrumbs.join(' > '));
                  }}>
                    {crumb}
                  </span>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Контейнер для товаров с overflow */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          minHeight: 0
        }}>
          <div className="shop-info-body">
            {renderItems()}
          </div>
        </div>

        {/* Кнопка "Назад" */}
        <button 
          className="back-button" 
          onClick={handleBack}
          style={{
            position: 'fixed',
            bottom: '20px',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 1001
          }}
        >
          Назад
        </button>
      </div>

      {/* Полноэкранное изображение */}
      {fullscreenImage && (
        <div 
          className="fullscreen-image-overlay"
          onClick={() => setFullscreenImage(null)}
        >
          <img 
            src={getProxiedImageUrl(fullscreenImage) || ''} 
            alt="Полноэкранное изображение"
            className="fullscreen-image"
          />
        </div>
      )}
    </div>
  );
}
