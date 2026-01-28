import { useState, useEffect } from 'preact/hooks';
import { api } from '../api/client';
import type { Shop } from '../types';
import { useActivity, getCount } from '../hooks/useActivity';
import { ShopSearch } from './ShopSearch';
import { ProductGallery } from './ProductGallery';
import { useMapStore } from '../store/mapStore';

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

interface ShopInfoProps {
  shop: Shop;
  onClose: () => void;
}

interface Product {
  category_path: string;
  size_color: string | null;
  size_color_label: string;
  price: string | null;
  photo_url: string | null;
  description: string | null;
  additional_photos: string[];
  row_index: number;
}

type CategoryItem = { path: string; isLeaf: false };
type ProductItem = { path: string; product: Product; isLeaf: true };
type ListItem = CategoryItem | ProductItem;

export function ShopInfo({ shop, onClose }: ShopInfoProps) {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPath, setCurrentPath] = useState<string>('');
  const [breadcrumbs, setBreadcrumbs] = useState<string[]>([]);
  const [fullscreenImage, setFullscreenImage] = useState<string | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  
  // Состояние для хранения текущего индекса фото для каждого товара
  const [productPhotoIndices, setProductPhotoIndices] = useState<{[key: number]: number}>({});
  
  const { shops } = useMapStore();

  // Отслеживание активности в магазине
  const { stats } = useActivity({
    shop_id: shop.id,
    city: shop.city,
    enabled: true
  });

  // Счетчик текущего магазина
  const shopUserCount = getCount(stats, 'shop', shop.id);

  useEffect(() => {
    // Загрузка каталога магазина
    api.getShopCatalog(shop.id).then(data => {
      setProducts(data.products || []);
      setLoading(false);
    }).catch(() => {
      setLoading(false);
    });
  }, [shop.id]);

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
        const photos = product.photo_url 
          ? [product.photo_url, ...(product.additional_photos || [])]
          : [];
        
        // Получаем текущий индекс фото для этого товара
        const currentPhotoIndex = productPhotoIndices[index] || 0;
        const currentPhoto = photos[currentPhotoIndex];
        
        // Обработчики свайпа для карточки товара
        const handleTouchStart = (e: TouchEvent) => {
          const touch = e.touches[0];
          setProductPhotoIndices(prev => ({ ...prev, [`start_${index}`]: touch.clientX }));
        };
        
        const handleTouchEnd = (e: TouchEvent) => {
          const touchEnd = e.changedTouches[0].clientX;
          const touchStart = (productPhotoIndices as any)[`start_${index}`] || touchEnd;
          const diff = touchStart - touchEnd;
          
          if (Math.abs(diff) > 50) { // минимальная дистанция свайпа
            if (diff > 0) {
              // Свайп влево - следующее фото
              setProductPhotoIndices(prev => ({
                ...prev,
                [index]: Math.min((prev[index] || 0) + 1, photos.length - 1)
              }));
            } else {
              // Свайп вправо - предыдущее фото
              setProductPhotoIndices(prev => ({
                ...prev,
                [index]: Math.max((prev[index] || 0) - 1, 0)
              }));
            }
          }
        };
        
        return (
          <div 
            key={index} 
            className="product-card"
            style={{ cursor: 'pointer' }}
          >
            {currentPhoto && (
              <div 
                style={{ 
                  position: 'relative',
                  width: '100%',
                  userSelect: 'none'
                }}
                onTouchStart={handleTouchStart as any}
                onTouchEnd={handleTouchEnd as any}
              >
                <img 
                  src={getProxiedImageUrl(currentPhoto) || ''} 
                  alt="" 
                  className="product-image"
                  onClick={() => setSelectedProduct(product)}
                  style={{ 
                    pointerEvents: 'none',
                    touchAction: 'pan-y' // разрешаем вертикальную прокрутку
                  }}
                />
                {/* Индикаторы фото */}
                {photos.length > 1 && (
                  <div style={{
                    position: 'absolute',
                    bottom: '8px',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    display: 'flex',
                    gap: '6px',
                    pointerEvents: 'none'
                  }}>
                    {photos.map((_, photoIdx) => (
                      <div 
                        key={photoIdx}
                        style={{
                          width: '8px',
                          height: '8px',
                          borderRadius: '50%',
                          background: photoIdx === currentPhotoIndex 
                            ? '#ff8c00' 
                            : 'rgba(255, 255, 255, 0.5)',
                          border: '1px solid white',
                          transition: 'all 0.3s ease'
                        }}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
            <div className="product-info">
              {product.size_color && (
                <div className="product-detail">
                  {product.size_color_label || 'Размер/Цвет'}: {product.size_color}
                </div>
              )}
              {product.price && (
                <div className="product-price" style={{ color: '#ff8c00', fontWeight: 'bold' }}>Цена: {product.price} ₽</div>
              )}
              {product.description && (
                <div className="product-description" style={{ 
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  wordBreak: 'break-word'
                }}>
                  {product.description}
                </div>
              )}
              <div className="product-info__bottom">
                {/* Кнопка действия для товара */}
                {shop.username && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      const cleanUsername = shop.username?.replace('@', '') || '';
                      window.open(`https://t.me/${cleanUsername}`, '_blank');
                    }}
                    style={{
                      width: '100%',
                      marginTop: '12px',
                      padding: '8px 12px',
                      background: 'rgba(240, 248, 255, 0.15)',
                      border: '1.5px solid #ff8c00',
                      borderRadius: '8px',
                      color: '#f0f8ff',
                      fontSize: '12px',
                      fontWeight: '600',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
                      transition: 'all 0.2s ease',
                      boxSizing: 'border-box'
                    }}
                    onMouseOver={(e) => {
                      e.currentTarget.style.background = 'rgba(240, 248, 255, 0.25)';
                      e.currentTarget.style.boxShadow = '0 0 12px rgba(240, 248, 255, 0.3)';
                    }}
                    onMouseOut={(e) => {
                      e.currentTarget.style.background = 'rgba(240, 248, 255, 0.15)';
                      e.currentTarget.style.boxShadow = 'none';
                    }}
                  >
                    <span>НАПИШИ НАМ</span>
                  </button>
                )}
              </div>
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
        
        {/* Карточка магазина - закреплена */}
        <div style={{
          flexShrink: 0,
          background: 'transparent',
          paddingBottom: '8px',
          paddingTop: '8px'
        }}>
          <div style={{
            background: 'rgba(30, 30, 30, 0.1)',
            border: '2px solid white',
            borderRadius: '12px',
            padding: '16px',
            margin: '8px 8px 8px 8px',
            boxShadow: '0 0 20px rgba(240, 248, 255, 0.3)',
            display: 'flex',
            gap: '16px',
            alignItems: 'flex-start'
          }}>
            {shop.photo_url && (
              <div style={{
                flex: '0 0 120px',
                width: '120px',
                height: '120px',
                borderRadius: '8px',
                overflow: 'hidden',
                border: '2px solid white',
                boxShadow: '0 0 15px rgba(255, 255, 255, 0.3)',
                background: 'rgba(255, 255, 255, 0.05)'
              }}>
                <img 
                  src={`https://raw.githubusercontent.com/chronosphere777/chronosphere/main/frontend/images/${shop.photo_url}`}
                  alt={shop.name}
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'contain',
                    display: 'block'
                  }}
                />
              </div>
            )}
            
            <div style={{ 
              flex: '1',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h3 style={{ 
                  color: '#f0f8ff', 
                  margin: '0',
                  fontSize: shop.name.length > 20 ? '14px' : (shop.name.length > 15 ? '16px' : '18px'),
                  lineHeight: '1.2',
                  wordBreak: 'break-word'
                }}>
                  {shop.name}
                </h3>
                <button
                  onClick={() => setIsSearchOpen(true)}
                  style={{
                    background: 'rgba(240, 248, 255, 0.1)',
                    border: '1px solid rgba(240, 248, 255, 0.3)',
                    color: '#f0f8ff',
                    fontSize: '18px',
                    cursor: 'pointer',
                    padding: '4px 8px',
                    borderRadius: '6px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                  aria-label="Поиск в магазине"
                  title="Поиск в магазине"
                >
                  🔍
                </button>
                <button
                  onClick={onClose}
                  style={{
                    background: 'transparent',
                    border: '2px solid white',
                    borderRadius: '50%',
                    color: 'white',
                    fontSize: '24px',
                    fontWeight: 'normal',
                    cursor: 'pointer',
                    marginLeft: 'auto',
                    width: '44px',
                    height: '44px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '0',
                    lineHeight: '1',
                    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.2)'
                  }}
                  aria-label="Закрыть каталог"
                  title="Закрыть каталог"
                >
                  ×
                </button>
                {shopUserCount > 0 && (
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '4px 8px',
                    background: 'rgba(240, 248, 255, 0.1)',
                    border: '1px solid rgba(240, 248, 255, 0.3)',
                    borderRadius: '12px',
                    fontSize: '12px',
                    color: '#f0f8ff'
                  }}>
                    <span>👤</span>
                    <span>{shopUserCount}</span>
                  </div>
                )}
              </div>
              
              {shop.city && (
                <div style={{ 
                  color: '#aaa', 
                  fontSize: '14px'
                }}>
                  {shop.city}
                </div>
              )}
              
              {shop.description && (
                <div style={{ 
                  color: '#f0f8ff', 
                  fontSize: '13px',
                  lineHeight: '1.4',
                  opacity: 0.9,
                  whiteSpace: 'pre-line'
                }}>
                  {shop.description}
                </div>
              )}
              
              {/* Кнопки действий */}
              <div style={{ display: 'flex', gap: '6px', marginTop: '8px', width: '100%', maxWidth: '100%', boxSizing: 'border-box' }}>
                {shop.username && (
                  <button
                    onClick={() => {
                      const cleanUsername = shop.username?.replace('@', '') || '';
                      window.open(`https://t.me/${cleanUsername}`, '_blank');
                    }}
                    style={{
                      flex: 1,
                      minWidth: 0,
                      maxWidth: '50%',
                      padding: '8px 12px',
                      background: 'rgba(240, 248, 255, 0.15)',
                      border: '1.5px solid #ff8c00',
                      borderRadius: '8px',
                      color: '#f0f8ff',
                      fontSize: '12px',
                      fontWeight: '600',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '5px',
                      transition: 'all 0.2s ease',
                      boxSizing: 'border-box',
                      overflow: 'hidden',
                      whiteSpace: 'nowrap'
                    }}
                    onMouseOver={(e) => {
                      e.currentTarget.style.background = 'rgba(240, 248, 255, 0.25)';
                      e.currentTarget.style.boxShadow = '0 0 15px rgba(240, 248, 255, 0.3)';
                    }}
                    onMouseOut={(e) => {
                      e.currentTarget.style.background = 'rgba(240, 248, 255, 0.15)';
                      e.currentTarget.style.boxShadow = 'none';
                    }}
                  >
                    <span>НАПИШИ НАМ</span>
                  </button>
                )}
                
                {shop.gis_url && shop.gis_url.includes('2gis.ru') && (
                  <button
                    onClick={() => {
                      // Парсим координаты из 2GIS URL (формат: m=lng,lat или m=lng%2Clat)
                      const match = shop.gis_url?.match(/m=([0-9.]+)(?:%2C|,)([0-9.]+)/);
                      if (match) {
                        const lng = match[1];
                        const lat = match[2];
                        window.open(`https://3.redirect.appmetrica.yandex.com/route?end-lat=${lat}&end-lon=${lng}&appmetrica_tracking_id=1178268795219780156`, '_blank');
                      }
                    }}
                    style={{
                      flex: 1,
                      minWidth: 0,
                      maxWidth: '50%',
                      padding: '8px 12px',
                      background: 'rgba(240, 248, 255, 0.15)',
                      border: '1.5px solid #ff8c00',
                      borderRadius: '8px',
                      color: '#f0f8ff',
                      fontSize: '12px',
                      fontWeight: '600',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '5px',
                      transition: 'all 0.2s ease',
                      boxSizing: 'border-box',
                      overflow: 'hidden',
                      whiteSpace: 'nowrap'
                    }}
                    onMouseOver={(e) => {
                      e.currentTarget.style.background = 'rgba(240, 248, 255, 0.25)';
                      e.currentTarget.style.boxShadow = '0 0 15px rgba(240, 248, 255, 0.3)';
                    }}
                    onMouseOut={(e) => {
                      e.currentTarget.style.background = 'rgba(240, 248, 255, 0.15)';
                      e.currentTarget.style.boxShadow = 'none';
                    }}
                  >
                    <span>ПОЕХАЛИ</span>
                  </button>
                )}
              </div>
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
      </div>
      
      {/* Кнопка назад внизу - закреплена вне контейнера */}
      <button 
        onClick={handleBack}
        style={{
          position: 'fixed',
          bottom: '20px',
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'rgba(30, 30, 30, 0.1)',
          backdropFilter: 'blur(10px)',
          border: '2px solid rgba(240, 248, 255, 0.5)',
          color: '#f0f8ff',
          padding: '12px 32px',
          borderRadius: '25px',
          fontSize: '16px',
          fontWeight: 'bold',
          cursor: 'pointer',
          zIndex: 900,
          boxShadow: '0 4px 20px rgba(240, 248, 255, 0.3)',
          transition: 'all 0.2s ease'
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'rgba(30, 30, 30, 0.2)';
          e.currentTarget.style.transform = 'translateX(-50%) scale(1.05)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'rgba(30, 30, 30, 0.1)';
          e.currentTarget.style.transform = 'translateX(-50%) scale(1)';
        }}
      >
        {breadcrumbs.length === 0 ? '← Выйти в город' : '← Назад'}
      </button>
      
      {/* Компонент поиска в магазине */}
      {isSearchOpen && (
        <ShopSearch
          shop={shop}
          onShopSelect={(selectedShop) => {
            setIsSearchOpen(false);
            onClose();
            // Небольшая задержка для плавного перехода
            setTimeout(() => {
              window.dispatchEvent(new CustomEvent('shop-select', { detail: selectedShop }));
            }, 100);
          }}
          shops={shops}
          onClose={() => setIsSearchOpen(false)}
        />
      )}
      
      {/* Галерея товара */}
      {selectedProduct && (
        <ProductGallery
          product={selectedProduct}
          shopUsername={shop.username}
          onClose={() => setSelectedProduct(null)}
          getProxiedImageUrl={getProxiedImageUrl}
        />
      )}
      
      {/* Полноэкранный просмотр фото */}
      {fullscreenImage && (
        <div 
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            background: 'rgba(0, 0, 0, 0.1)',
            zIndex: 10000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer'
          }}
          onClick={() => setFullscreenImage(null)}
        >
          <button
            onClick={() => setFullscreenImage(null)}
            style={{
              position: 'absolute',
              top: '20px',
              right: '20px',
              background: 'transparent',
              border: '2px solid white',
              borderRadius: '50%',
              color: 'white',
              fontSize: '36px',
              fontWeight: 'normal',
              cursor: 'pointer',
              width: '64px',
              height: '64px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '0',
              lineHeight: '1',
              zIndex: 10001,
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)'
            }}
          >
            ×
          </button>
          <img 
            src={getProxiedImageUrl(fullscreenImage) || ''} 
            alt="Fullscreen"
            style={{
              maxWidth: '95%',
              maxHeight: '95%',
              objectFit: 'contain'
            }}
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}
