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

interface ShopSearchProps {
  shop: Shop;
  onShopSelect: (shop: Shop) => void;
  shops: Shop[];
  onClose: () => void;
}

export function ShopSearch({ shop, onShopSelect, shops, onClose }: ShopSearchProps) {
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
      // Используем API метод с фильтром по магазину
      api.searchProductsInShop(query, shop.id, sortBy)
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
  }, [query, sortBy, shop.id]);

  const handleShopClick = (result: SearchResult) => {
    if (result.shop_id === shop.id) {
      // Если это текущий магазин - просто закрываем поиск
      setQuery('');
      setResults([]);
    } else {
      // Если это другой магазин - находим его и переключаемся
      const targetShop = shops.find(s => s.id === result.shop_id);
      if (targetShop) {
        setQuery('');
        setResults([]);
        onClose();
        onShopSelect(targetShop);
      }
    }
  };

  // Разделяем результаты на текущий магазин и другие
  const currentShopResults = results.filter(r => r.shop_id === shop.id);
  const otherShopsResults = results.filter(r => r.shop_id !== shop.id);

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0, 0, 0, 0.85)',
      zIndex: 1001,
      display: 'flex',
      flexDirection: 'column'
    }}
    onClick={() => {
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
            placeholder={`Поиск в ${shop.name}...`}
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* Результаты из текущего магазина */}
            {currentShopResults.length > 0 && (
              <div>
                <div style={{
                  color: '#4ade80',
                  fontSize: '14px',
                  fontWeight: '600',
                  marginBottom: '12px',
                  padding: '8px 12px',
                  background: 'rgba(74, 222, 128, 0.1)',
                  borderRadius: '8px',
                  border: '1px solid rgba(74, 222, 128, 0.3)'
                }}>
                  В этом магазине ({currentShopResults.length})
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {currentShopResults.map((result, index) => (
                    <ProductCard key={`current-${index}`} result={result} onClick={handleShopClick} isCurrentShop={true} />
                  ))}
                </div>
              </div>
            )}

            {/* Результаты из других магазинов */}
            {otherShopsResults.length > 0 && (
              <div>
                <div style={{
                  color: 'rgba(240, 248, 255, 0.7)',
                  fontSize: '14px',
                  fontWeight: '600',
                  marginBottom: '12px',
                  padding: '8px 12px',
                  background: 'rgba(240, 248, 255, 0.05)',
                  borderRadius: '8px',
                  border: '1px solid rgba(240, 248, 255, 0.2)'
                }}>
                  В других городах ({otherShopsResults.length})
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {otherShopsResults.map((result, index) => (
                    <ProductCard key={`other-${index}`} result={result} onClick={handleShopClick} isCurrentShop={false} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// Отдельный компонент для карточки товара
function ProductCard({ result, onClick, isCurrentShop }: { result: SearchResult; onClick: (result: SearchResult) => void; isCurrentShop: boolean }) {
  return (
    <div
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

      {/* Кнопка магазина - показываем только для других магазинов */}
      {!isCurrentShop && (
        <button
          onClick={() => onClick(result)}
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
      )}
    </div>
  );
}
