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
  city: string;
}

interface SearchBarProps {
  onShopSelect: (shop: Shop) => void;
  shops: Shop[];
}

export function SearchBar({ onShopSelect, shops }: SearchBarProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
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
      api.searchProducts(query)
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
  }, [query]);

  const handleResultClick = (result: SearchResult) => {
    // Находим магазин по shop_id
    const shop = shops.find(s => s.id === result.shop_id);
    if (shop) {
      onShopSelect(shop);
      setIsOpen(false);
      setQuery('');
      setResults([]);
    }
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        style={{
          position: 'fixed',
          top: '16px',
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
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)'
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
      background: 'rgba(0, 0, 0, 0.8)',
      zIndex: 1000,
      display: 'flex',
      flexDirection: 'column'
    }}
    onClick={() => {
      setIsOpen(false);
      setQuery('');
      setResults([]);
    }}>
      <div style={{
        padding: '16px',
        background: 'rgba(30, 30, 30, 0.95)',
        borderBottom: '1px solid rgba(240, 248, 255, 0.1)'
      }}
      onClick={(e) => e.stopPropagation()}>
        <div style={{
          display: 'flex',
          gap: '8px',
          alignItems: 'center'
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
      </div>

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
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {results.map((result, index) => (
              <div
                key={index}
                onClick={() => handleResultClick(result)}
                style={{
                  background: 'rgba(30, 30, 30, 0.8)',
                  border: '1px solid rgba(240, 248, 255, 0.2)',
                  borderRadius: '8px',
                  padding: '12px',
                  cursor: 'pointer',
                  display: 'flex',
                  gap: '12px',
                  alignItems: 'flex-start'
                }}
              >
                {result.photo_url && (
                  <div style={{
                    width: '60px',
                    height: '60px',
                    borderRadius: '4px',
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
                    fontSize: '14px',
                    fontWeight: '500',
                    marginBottom: '4px'
                  }}>
                    {result.product_name}
                  </div>
                  
                  {result.price && (
                    <div style={{
                      color: 'rgba(240, 248, 255, 0.7)',
                      fontSize: '13px',
                      marginBottom: '4px'
                    }}>
                      {result.price}
                    </div>
                  )}
                  
                  <div style={{
                    color: 'rgba(240, 248, 255, 0.5)',
                    fontSize: '12px'
                  }}>
                    {result.city} • {result.shop_name}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
