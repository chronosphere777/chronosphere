import { useState, useEffect } from 'preact/hooks';
import { api } from '../api/client';
import type { Shop } from '../types';
import { hapticFeedback } from '../utils/telegram';

interface WholesaleCatalogProps {
  cityName: string;
  onClose: () => void;
  onShopClick: (shop: Shop) => void;
}

export function WholesaleCatalog({ cityName, onClose, onShopClick }: WholesaleCatalogProps) {
  const [shops, setShops] = useState<Shop[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Загрузка магазинов ОПТ
    api.getWholesaleShops().then(data => {
      setShops(data.shops || []);
      setLoading(false);
    }).catch(() => {
      setLoading(false);
    });
  }, []);

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
        </div>

        {/* Контейнер для магазинов с overflow */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          minHeight: 0,
          padding: '0 8px'
        }}>
          {shops.length === 0 ? (
            <div className="empty-state">Магазины не найдены</div>
          ) : (
            shops.map((shop) => {
              const photoUrl = shop.photo_url 
                ? `https://raw.githubusercontent.com/chronosphere777/chronosphere/main/frontend/images/${shop.photo_url}`
                : null;
              
              return (
                <div 
                  key={shop.id} 
                  style={{
                    background: 'rgba(255, 215, 0, 0.1)',
                    border: '1.5px solid rgba(255, 215, 0, 0.4)',
                    borderRadius: '12px',
                    padding: '12px',
                    marginBottom: '12px',
                    cursor: 'pointer',
                    display: 'flex',
                    gap: '12px',
                    alignItems: 'flex-start',
                    transition: 'all 0.2s ease',
                    boxShadow: '0 0 15px rgba(255, 215, 0, 0.2)'
                  }}
                  onClick={() => {
                    hapticFeedback('medium');
                    onClose();
                    onShopClick(shop);
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(255, 215, 0, 0.2)';
                    e.currentTarget.style.boxShadow = '0 0 25px rgba(255, 215, 0, 0.4)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'rgba(255, 215, 0, 0.1)';
                    e.currentTarget.style.boxShadow = '0 0 15px rgba(255, 215, 0, 0.2)';
                  }}
                >
                  {photoUrl && (
                    <div style={{
                      flex: '0 0 80px',
                      width: '80px',
                      height: '80px',
                      borderRadius: '8px',
                      overflow: 'hidden',
                      border: '1.5px solid rgba(255, 215, 0, 0.5)',
                      boxShadow: '0 0 10px rgba(255, 215, 0, 0.3)'
                    }}>
                      <img 
                        src={photoUrl} 
                        alt={shop.name}
                        style={{
                          width: '100%',
                          height: '100%',
                          objectFit: 'cover'
                        }}
                      />
                    </div>
                  )}
                  
                  <div style={{ flex: 1 }}>
                    <h3 style={{
                      color: '#FFD700',
                      margin: '0 0 6px 0',
                      fontSize: '16px',
                      fontWeight: '600',
                      textShadow: '0 0 6px rgba(255, 215, 0, 0.4)'
                    }}>
                      {shop.name}
                    </h3>
                    
                    {shop.city && (
                      <div style={{ 
                        color: '#FFA500', 
                        fontSize: '13px',
                        marginBottom: '4px',
                        opacity: 0.9
                      }}>
                        {shop.city}
                      </div>
                    )}
                    
                    {shop.description && (
                      <div style={{ 
                        color: '#FFD700', 
                        fontSize: '12px',
                        lineHeight: '1.4',
                        opacity: 0.8
                      }}>
                        {shop.description}
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Кнопка "Назад" */}
        <button 
          className="back-button" 
          onClick={onClose}
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
    </div>
  );
}
