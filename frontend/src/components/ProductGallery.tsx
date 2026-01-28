import { useState, useEffect } from 'preact/hooks';

interface Product {
  category_path: string;
  size_color: string | null;
  size_color_label: string;
  price: string | null;
  photo_url: string | null;
  description: string | null;
  additional_photos: string[];
}

interface ProductGalleryProps {
  product: Product;
  shopUsername?: string | null;
  onClose: () => void;
  getProxiedImageUrl: (url: string | null) => string | null;
}

export function ProductGallery({ product, shopUsername, onClose, getProxiedImageUrl }: ProductGalleryProps) {
  const photos = product.photo_url 
    ? [product.photo_url, ...(product.additional_photos || [])]
    : [];
  
  const [currentIndex, setCurrentIndex] = useState(0);
  const [touchStart, setTouchStart] = useState(0);
  const [touchEnd, setTouchEnd] = useState(0);

  const handlePrevious = () => {
    setCurrentIndex((prev) => (prev === 0 ? photos.length - 1 : prev - 1));
  };

  const handleNext = () => {
    setCurrentIndex((prev) => (prev === photos.length - 1 ? 0 : prev + 1));
  };

  const handleTouchStart = (e: TouchEvent) => {
    setTouchStart(e.targetTouches[0].clientX);
  };

  const handleTouchMove = (e: TouchEvent) => {
    setTouchEnd(e.targetTouches[0].clientX);
  };

  const handleTouchEnd = () => {
    if (touchStart - touchEnd > 75) {
      handleNext();
    }
    if (touchStart - touchEnd < -75) {
      handlePrevious();
    }
  };
  
  // Переход к конкретному фото по клику на миниатюру
  const handleThumbnailClick = (index: number) => {
    setCurrentIndex(index);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') handlePrevious();
      if (e.key === 'ArrowRight') handleNext();
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  if (photos.length === 0) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        background: 'rgba(0, 0, 0, 0.95)',
        zIndex: 10000,
        display: 'flex',
        flexDirection: 'column'
      }}
      onClick={onClose}
    >
      {/* Кнопка закрытия */}
      <button
        onClick={onClose}
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

      {/* Большое фото с боковыми превью */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '15px',
          paddingTop: '80px',
          paddingBottom: '0',
          overflow: 'hidden'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Предыдущее фото слева (затемненное) */}
        {currentIndex > 0 ? (
          <div 
            onClick={(e) => {
              e.stopPropagation();
              setCurrentIndex(currentIndex - 1);
            }}
            style={{
              maxWidth: '20%',
              maxHeight: '70%',
              opacity: 0.5,
              cursor: 'pointer',
              flexShrink: 0
            }}>
            <img
              src={getProxiedImageUrl(photos[currentIndex - 1]) || ''}
              alt="Предыдущее"
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'contain',
                borderRadius: '8px'
              }}
            />
          </div>
        ) : (
          <div style={{ maxWidth: '20%', flexShrink: 0 }} />
        )}

        {/* Основное фото с закругленными краями */}
        <div
          style={{
            maxWidth: '60%',
            maxHeight: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
          onTouchStart={handleTouchStart as any}
          onTouchMove={handleTouchMove as any}
          onTouchEnd={handleTouchEnd}
        >
          <img
            src={getProxiedImageUrl(photos[currentIndex]) || ''}
            alt={`Фото ${currentIndex + 1}`}
            key={photos[currentIndex]}
            style={{
              maxWidth: '100%',
              maxHeight: '100%',
              width: 'auto',
              height: 'auto',
              objectFit: 'contain',
              userSelect: 'none',
              borderRadius: '16px',
              boxShadow: '0 8px 24px rgba(0, 0, 0, 0.5)'
            }}
          />
        </div>

        {/* Следующее фото справа (затемненное) */}
        {currentIndex < photos.length - 1 ? (
          <div 
            onClick={(e) => {
              e.stopPropagation();
              setCurrentIndex(currentIndex + 1);
            }}
            style={{
              maxWidth: '20%',
              maxHeight: '70%',
              opacity: 0.5,
              cursor: 'pointer',
              flexShrink: 0
            }}>
            <img
              src={getProxiedImageUrl(photos[currentIndex + 1]) || ''}
              alt="Следующее"
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'contain',
                borderRadius: '8px'
              }}
            />
          </div>
        ) : (
          <div style={{ maxWidth: '20%', flexShrink: 0 }} />
        )}
      </div>

      {/* Информация и прогресс-бар */}
      <div
        style={{
          background: 'rgba(0, 0, 0, 0.8)',
          padding: '20px',
          color: 'white'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Миниатюры с индикатором над прогресс-баром */}
        {photos.length > 1 && (
          <div 
            className="thumbnails-container"
            style={{
              display: 'flex',
              gap: '10px',
              justifyContent: photos.length <= 4 ? 'center' : 'flex-start',
              marginBottom: '15px',
              marginTop: '10px',
              overflowX: 'scroll',
              overflowY: 'hidden',
              WebkitOverflowScrolling: 'touch',
              scrollbarWidth: 'none',
              msOverflowStyle: 'none'
            }}
          >
            <style>{`
              .thumbnails-container::-webkit-scrollbar {
                display: none;
              }
            `}</style>
            {photos.map((photo, index) => (
              <div
                key={index}
                onClick={() => handleThumbnailClick(index)}
                style={{
                  position: 'relative',
                  width: '60px',
                  height: '60px',
                  flexShrink: 0,
                  cursor: 'pointer',
                  border: index === currentIndex ? '3px solid #ff8c00' : '2px solid rgba(255, 255, 255, 0.3)',
                  borderRadius: '8px',
                  overflow: 'hidden',
                  transition: 'all 0.3s ease',
                  opacity: index === currentIndex ? 1 : 0.6
                }}
              >
                <img
                  src={getProxiedImageUrl(photo) || ''}
                  alt={`Миниатюра ${index + 1}`}
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover'
                  }}
                />
                {/* Индикатор текущего фото */}
                {index === currentIndex && (
                  <div style={{
                    position: 'absolute',
                    top: '-8px',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    width: '0',
                    height: '0',
                    borderLeft: '8px solid transparent',
                    borderRight: '8px solid transparent',
                    borderTop: '8px solid #ff8c00'
                  }} />
                )}
              </div>
            ))}
          </div>
        )}

        {/* Описание товара */}
        <div style={{ marginBottom: '15px' }}>
          {product.size_color && (
            <div style={{ fontSize: '16px', marginBottom: '8px' }}>
              <strong>{product.size_color_label}:</strong> {product.size_color}
            </div>
          )}
          {product.price && (
            <div style={{ fontSize: '20px', color: '#ff8c00', fontWeight: 'bold', marginBottom: '8px' }}>
              Цена: {product.price} ₽
            </div>
          )}
          {product.description && (
            <div style={{ fontSize: '14px', lineHeight: '1.6', color: 'rgba(255, 255, 255, 0.8)' }}>
              {product.description}
            </div>
          )}
        </div>

        {/* Кнопка "Напиши нам" */}
        {shopUsername && (
          <a
            href={`https://t.me/${shopUsername.replace('@', '')}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'inline-block',
              background: 'rgba(255, 255, 255, 0.1)',
              backdropFilter: 'blur(10px)',
              color: 'white',
              border: '1.5px solid #ff8c00',
              padding: '12px 30px',
              borderRadius: '25px',
              textDecoration: 'none',
              fontSize: '16px',
              fontWeight: '600',
              transition: 'all 0.3s',
              cursor: 'pointer'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(255, 140, 0, 0.2)';
              e.currentTarget.style.transform = 'scale(1.05)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
              e.currentTarget.style.transform = 'scale(1)';
            }}
          >
            НАПИШИ НАМ
          </a>
        )}
      </div>
    </div>
  );
}
