import { useEffect, useState, useRef } from 'preact/hooks';
import { useActivity, getCount } from '../hooks/useActivity';
import { UserCounter } from './UserCounter';

interface CategoryModalProps {
  categories: string[];
  selectedCategory: string | null;
  onSelectCategory: (category: string | null) => void;
  onClose: () => void;
  cityName?: string;
}

export function CategoryModal({ categories, selectedCategory, onSelectCategory, onClose, cityName }: CategoryModalProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [startX, setStartX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState(0);
  const sliderRef = useRef<HTMLDivElement>(null);

  // Получаем статистику активных пользователей
  const { stats } = useActivity({ enabled: true });

  // Все опции включая "Все категории"
  const allOptions = ['Все категории', ...categories];

  useEffect(() => {
    // Устанавливаем начальный индекс на основе выбранной категории
    if (selectedCategory === null) {
      setCurrentIndex(0);
    } else {
      const index = allOptions.indexOf(selectedCategory);
      if (index !== -1) {
        setCurrentIndex(index);
      }
    }
  }, [selectedCategory]);

  useEffect(() => {
    // Закрываем при нажатии Escape
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  const handlePrev = () => {
    const newIndex = currentIndex > 0 ? currentIndex - 1 : allOptions.length - 1;
    setCurrentIndex(newIndex);
    const category = allOptions[newIndex];
    onSelectCategory(category === 'Все категории' ? null : category);
  };

  const handleNext = () => {
    const newIndex = currentIndex < allOptions.length - 1 ? currentIndex + 1 : 0;
    setCurrentIndex(newIndex);
    const category = allOptions[newIndex];
    onSelectCategory(category === 'Все категории' ? null : category);
  };

  const handleTouchStart = (e: TouchEvent) => {
    setStartX(e.touches[0].clientX);
    setIsDragging(true);
    setDragOffset(0);
  };

  const handleTouchMove = (e: TouchEvent) => {
    if (!isDragging) return;
    
    const currentX = e.touches[0].clientX;
    const diff = currentX - startX;
    setDragOffset(diff);

    // Переключаем категорию при значительном перетаскивании
    if (diff < -80) {
      handleNext();
      setStartX(currentX);
      setDragOffset(0);
    }
    else if (diff > 80) {
      handlePrev();
      setStartX(currentX);
      setDragOffset(0);
    }
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
    setDragOffset(0);
  };

  const handleMouseDown = (e: MouseEvent) => {
    setStartX(e.clientX);
    setIsDragging(true);
    setDragOffset(0);
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!isDragging) return;
    
    const currentX = e.clientX;
    const diff = currentX - startX;
    setDragOffset(diff);

    // Переключаем категорию при значительном перетаскивании
    if (diff < -80) {
      handleNext();
      setStartX(currentX);
      setDragOffset(0);
    }
    else if (diff > 80) {
      handlePrev();
      setStartX(currentX);
      setDragOffset(0);
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
    setDragOffset(0);
  };

  useEffect(() => {
    if (!isDragging) return;
    
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, startX, currentIndex]);

  return (
    <div 
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        padding: '20px 0',
        zIndex: 1000,
        pointerEvents: 'none'
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Индикатор закрытия */}
      <div 
        onClick={onClose}
        style={{
          position: 'absolute',
          top: '8px',
          left: '50%',
          transform: 'translateX(-50%)',
          width: '40px',
          height: '4px',
          borderRadius: '2px',
          background: 'rgba(255, 255, 255, 0.5)',
          cursor: 'pointer',
          pointerEvents: 'auto',
          boxShadow: '0 0 10px rgba(255, 255, 255, 0.5)'
        }}
      />

      {/* Слайдер категорий */}
      <div
        ref={sliderRef}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '20px',
          padding: '10px 20px',
          userSelect: 'none',
          cursor: isDragging ? 'grabbing' : 'grab',
          pointerEvents: 'auto',
          transform: `translateX(${dragOffset}px)`,
          transition: isDragging ? 'none' : 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
        }}
      >
        {/* Предыдущая категория (стеклянная) */}
        <div
          onClick={handlePrev}
          style={{
            flex: '0 0 auto',
            minWidth: '60px',
            padding: '6px 14px',
            background: 'rgba(255, 255, 255, 0.08)',
            backdropFilter: 'blur(10px)',
            border: '1px solid rgba(255, 255, 255, 0.2)',
            borderRadius: '18px',
            color: 'rgba(255, 255, 255, 0.6)',
            fontSize: '11px',
            fontWeight: '300',
            textAlign: 'center',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            transition: 'all 0.5s cubic-bezier(0.4, 0, 0.2, 1)',
            opacity: 0.7,
            transform: 'scale(0.85)',
            boxShadow: '0 4px 15px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis'
          }}
        >
          {(() => {
            const prevIndex = currentIndex > 0 ? currentIndex - 1 : allOptions.length - 1;
            return allOptions[prevIndex] === 'Все категории' ? 'ВСЕ' : allOptions[prevIndex];
          })()}
        </div>

        {/* Текущая категория (яркая) */}
        <div
          style={{
            flex: '0 0 auto',
            minWidth: '120px',
            padding: '9.35px 19.2px',
            background: 'rgba(255, 255, 255, 0.15)',
            backdropFilter: 'blur(15px)',
            border: '1.5px solid rgba(255, 255, 255, 0.8)',
            borderRadius: '25px',
            color: '#fff',
            fontSize: '18px',
            fontWeight: '400',
            textAlign: 'center',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            boxShadow: '0 0 30px rgba(255, 255, 255, 0.5), 0 8px 25px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.3)',
            transition: 'all 0.5s cubic-bezier(0.4, 0, 0.2, 1)',
            transform: 'scale(1.1)',
            textShadow: '0 0 15px rgba(255, 255, 255, 0.8), 0 2px 5px rgba(0, 0, 0, 0.5)',
            whiteSpace: 'nowrap'
          }}
        >
          <span>{allOptions[currentIndex] === 'Все категории' ? 'ВСЕ КАТЕГОРИИ' : allOptions[currentIndex]}</span>
          {cityName && allOptions[currentIndex] !== 'Все категории' && (
            <UserCounter 
              count={getCount(stats, 'category', `${cityName}|${allOptions[currentIndex]}`)} 
              style={{ marginLeft: 0 }}
            />
          )}
        </div>

        {/* Следующая категория (стеклянная) */}
        <div
          onClick={handleNext}
          style={{
            flex: '0 0 auto',
            minWidth: '60px',
            padding: '6px 14px',
            background: 'rgba(255, 255, 255, 0.08)',
            backdropFilter: 'blur(10px)',
            border: '1px solid rgba(255, 255, 255, 0.2)',
            borderRadius: '18px',
            color: 'rgba(255, 255, 255, 0.6)',
            fontSize: '11px',
            fontWeight: '300',
            textAlign: 'center',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            transition: 'all 0.5s cubic-bezier(0.4, 0, 0.2, 1)',
            opacity: 0.7,
            transform: 'scale(0.85)',
            boxShadow: '0 4px 15px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis'
          }}
        >
          {(() => {
            const nextIndex = currentIndex < allOptions.length - 1 ? currentIndex + 1 : 0;
            return allOptions[nextIndex] === 'Все категории' ? 'ВСЕ' : allOptions[nextIndex];
          })()}
        </div>
      </div>

      {/* Индикаторы */}
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        gap: '8px',
        marginTop: '15px',
        pointerEvents: 'auto'
      }}>
        {allOptions.map((_, index) => (
          <div
            key={index}
            onClick={() => {
              setCurrentIndex(index);
              const category = allOptions[index];
              onSelectCategory(category === 'Все категории' ? null : category);
            }}
            style={{
              width: index === currentIndex ? '24px' : '8px',
              height: '8px',
              borderRadius: '4px',
              background: index === currentIndex 
                ? 'rgba(255, 255, 255, 0.9)' 
                : 'rgba(255, 255, 255, 0.3)',
              cursor: 'pointer',
              transition: 'all 0.3s ease',
              boxShadow: index === currentIndex ? '0 0 10px rgba(255, 255, 255, 0.6)' : 'none'
            }}
          />
        ))}
      </div>
    </div>
  );
}
