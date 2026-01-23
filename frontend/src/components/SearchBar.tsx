import { useState, useRef, useEffect } from 'preact/hooks';
import { api } from '../api/client';
import type { Shop } from '../types';

interface SearchResult {
  product_name: string;
  category_path: string;
  price: string | null;
  photo_url: string | null;
  description: string | null;
  shop_id: string;
  shop_name: string;
  shop_category: string;
  city: string;
}

interface SearchBarProps {
  onShopSelect: (shop: Shop) => void;
  shops: Shop[];
  onFlyToShop?: (shop: Shop) => void;
  onCloseCatalog?: () => void;
}

export function SearchBar({ onShopSelect, shops, onFlyToShop, onCloseCatalog }: SearchBarProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [sortBy, setSortBy] = useState<'relevance' | 'price_asc' | 'price_desc'>('relevance');
  const searchTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    if (query.length < 2) {
      setResults([]);
      return;
    }

    setLoading(true);

    // Debounce поиска
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    searchTimeoutRef.current = window.setTimeout(() => {
      api.searchProducts(query, sortBy)
        .then(data => {
          setResults(data.results || []);
          setLoading(false);
        })
        .catch(() => {
          setResults([]);
          setLoading(false);
        });
    }, 500);

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [query, sortBy]);

  const handleShopClick = (result: SearchResult) => {
    // Находим магазин по shop_id
    const shop = shops.find(s => s.id === result.shop_id);
    if (shop) {
      setIsOpen(false);
      setQuery('');
      setResults([]);
      
      // Закрываем текущий каталог если открыт
      if (onCloseCatalog) {
        onCloseCatalog();
      }
      
      // Сначала летим к магазину на карте
      if (onFlyToShop) {
        onFlyToShop(shop);
        // Затем через небольшую задержку открываем каталог
        setTimeout(() => {
          onShopSelect(shop);
        }, 1500);
      } else {
        onShopSelect(shop);
      }
    }
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        style={{
          position: 'fixed',
          bottom: '80px',
          left: '16px',
          width: '48px',
          height: '48px',
          borderRadius: '50%',
          background: 'rgba(30, 30, 30, 0.9)',
          border: '2px solid rgba(240, 248, 255, 0.3)',
          color: '#f0f8ff',
          fontSize: '20px',
          cursor: 'pointer',
          zIndex: 999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
          transition: 'all 0.3s ease'
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = 'scale(1.1)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = 'scale(1)';
        }}
      >
        🔍
      </button>
    );
  }

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0, 0, 0, 0.85)',
      zIndex: 1000,
      display: 'flex',
      flexDirection: 'column'
    }}
    onClick={() => {
      setIsOpen(false);
      setQuery('');
      setResults([]);
    }}>
      {/* Заголовок поиска */}
      <div style={{
        padding: '16px',
        background: 'rgba(30, 30, 30, 0.95)',
        borderBottom: '1px solid rgba(240, 248, 255, 0.1)'
      }}
      onClick={(e) => e.stopPropagation()}>
        <div style={{
          display: 'flex',
          gap: '8px',
          alignItems: 'center',
          marginBottom: '12px'
        }}>
          <input
            type="text"
            placeholder="Поиск товаров..."
            value={query}
            onInput={(e) => setQuery((e.target as HTMLInputElement).value)}
            autoFocus
            style={{
              flex: 1,
              padding: '12px 16px',
              background: 'rgba(240, 248, 255, 0.05)',
              border: '1px solid rgba(240, 248, 255, 0.2)',
              borderRadius: '8px',
              color: '#f0f8ff',
              fontSize: '16px',
              outline: 'none'
            }}
          />
          <button
            onClick={() => {
              setIsOpen(false);
              setQuery('');
              setResults([]);
            }}
            style={{
              padding: '12px 16px',
              background: 'rgba(240, 248, 255, 0.1)',
              border: '1px solid rgba(240, 248, 255, 0.2)',
              borderRadius: '8px',
              color: '#f0f8ff',
              cursor: 'pointer',
              fontSize: '16px'
            }}
          >
            ✕
          </button>
        </div>

        {/* Фильтры */}
        <div style={{
          display: 'flex',
          gap: '8px',
          flexWrap: 'wrap'
        }}>
          <button
            onClick={() => setSortBy('relevance')}
            style={{
              padding: '8px 12px',
              background: sortBy === 'relevance' ? 'rgba(240, 248, 255, 0.2)' : 'rgba(240, 248, 255, 0.05)',
              border: `1px solid ${sortBy === 'relevance' ? 'rgba(240, 248, 255, 0.4)' : 'rgba(240, 248, 255, 0.2)'}`,
              borderRadius: '6px',
              color: '#f0f8ff',
              cursor: 'pointer',
              fontSize: '13px'
            }}
          >
            По релевантности
          </button>
          <button
            onClick={() => setSortBy('price_asc')}
            style={{
              padding: '8px 12px',
              background: sortBy === 'price_asc' ? 'rgba(240, 248, 255, 0.2)' : 'rgba(240, 248, 255, 0.05)',
              border: `1px solid ${sortBy === 'price_asc' ? 'rgba(240, 248, 255, 0.4)' : 'rgba(240, 248, 255, 0.2)'}`,
              borderRadius: '6px',
              color: '#f0f8ff',
              cursor: 'pointer',
              fontSize: '13px'
            }}
          >
            Дешевле ↑
          </button>
          <button
            onClick={() => setSortBy('price_desc')}
            style={{
              padding: '8px 12px',
              background: sortBy === 'price_desc' ? 'rgba(240, 248, 255, 0.2)' : 'rgba(240, 248, 255, 0.05)',
              border: `1px solid ${sortBy === 'price_desc' ? 'rgba(240, 248, 255, 0.4)' : 'rgba(240, 248, 255, 0.2)'}`,
              borderRadius: '6px',
              color: '#f0f8ff',
              cursor: 'pointer',
              fontSize: '13px'
            }}
          >
            Дороже ↓
          </button>
        </div>
      </div>

      {/* Результаты */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '16px'
      }}
      onClick={(e) => e.stopPropagation()}>
        {loading && (
          <div style={{ 
            textAlign: 'center', 
            color: 'rgba(240, 248, 255, 0.5)',
            padding: '20px' 
          }}>
            Поиск...
          </div>
        )}

        {!loading && query.length > 0 && query.length < 2 && (
          <div style={{ 
            textAlign: 'center', 
            color: 'rgba(240, 248, 255, 0.5)',
            padding: '20px' 
          }}>
            Введите минимум 2 символа
          </div>
        )}

        {!loading && query.length >= 2 && results.length === 0 && (
          <div style={{ 
            textAlign: 'center', 
            color: 'rgba(240, 248, 255, 0.5)',
            padding: '20px' 
          }}>
            Ничего не найдено
          </div>
        )}

        {!loading && results.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {results.map((result, index) => (
              <div
                key={index}
                style={{
                  background: 'rgba(30, 30, 30, 0.8)',
                  border: '1px solid rgba(240, 248, 255, 0.2)',
                  borderRadius: '12px',
                  padding: '12px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px'
                }}
              >
                {/* Товар */}
                <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                  {result.photo_url && (
                    <div style={{
                      width: '80px',
                      height: '80px',
                      borderRadius: '8px',
                      overflow: 'hidden',
                      flexShrink: 0,
                      background: 'rgba(240, 248, 255, 0.05)'
                    }}>
                      <img
                        src={result.photo_url.includes('drive.google.com') 
                          ? `https://chronosphere7777.pythonanywhere.com/api/proxy-image?url=${encodeURIComponent(result.photo_url)}`
                          : result.photo_url}
                        alt={result.product_name}
                        style={{
                          width: '100%',
                          height: '100%',
                          objectFit: 'cover'
                        }}
                      />
                    </div>
                  )}
                  
                  <div style={{ flex: 1 }}>
                    <div style={{
                      color: '#f0f8ff',
                      fontSize: '15px',
                      fontWeight: '500',
                      marginBottom: '6px',
                      lineHeight: '1.3'
                    }}>
                      {result.product_name}
                    </div>
                    
                    {result.price && (
                      <div style={{
                        color: '#4ade80',
                        fontSize: '16px',
                        fontWeight: 'bold',
                        marginBottom: '4px'
                      }}>
                        {result.price}
                      </div>
                    )}
                    
                    {result.category_path && (
                      <div style={{
                        color: 'rgba(240, 248, 255, 0.5)',
                        fontSize: '12px',
                        marginBottom: '4px'
                      }}>
                        {result.category_path}
                      </div>
                    )}
                  </div>
                </div>

                {/* Кнопка магазина */}
                <button
                  onClick={() => handleShopClick(result)}
                  style={{
                    width: '100%',
                    padding: '12px',
                    background: 'rgba(240, 248, 255, 0.1)',
                    border: '1px solid rgba(240, 248, 255, 0.3)',
                    borderRadius: '8px',
                    color: '#f0f8ff',
                    fontSize: '14px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    transition: 'all 0.2s'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(240, 248, 255, 0.15)';
                    e.currentTarget.style.borderColor = 'rgba(240, 248, 255, 0.5)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'rgba(240, 248, 255, 0.1)';
                    e.currentTarget.style.borderColor = 'rgba(240, 248, 255, 0.3)';
                  }}
                >
                  <div style={{ textAlign: 'left' }}>
                    <div style={{ fontWeight: '500' }}>{result.shop_name}</div>
                    <div style={{ 
                      fontSize: '12px', 
                      color: 'rgba(240, 248, 255, 0.6)',
                      marginTop: '2px'
                    }}>
                      {result.city} • {result.shop_category}
                    </div>
                  </div>
                  <div style={{ fontSize: '18px' }}>→</div>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
