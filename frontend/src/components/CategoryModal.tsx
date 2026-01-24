import { useEffect } from 'preact/hooks';
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
  // Получаем статистику активных пользователей
  const { stats } = useActivity({ enabled: true });

  // Все опции включая "Все категории"
  const allOptions = ['Все категории', ...categories];

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

  return (
    <div 
      onClick={onClose}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.1)',
        backdropFilter: 'blur(5px)',
        zIndex: 2000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px'
      }}
    >
      <div 
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: '600px',
          width: '100%',
          maxHeight: '80vh',
          background: 'rgba(255, 255, 255, 0.1)',
          backdropFilter: 'blur(20px)',
          border: '2px solid rgba(255, 255, 255, 0.8)',
          borderRadius: '20px',
          padding: '30px',
          boxShadow: '0 0 40px rgba(255, 255, 255, 0.3), inset 0 2px 0 rgba(255, 255, 255, 0.2)',
          display: 'flex',
          flexDirection: 'column',
          gap: '20px'
        }}
      >
        {/* Заголовок */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <h2 style={{
            color: '#fff',
            fontSize: '24px',
            fontWeight: '400',
            margin: 0,
            textShadow: '0 0 15px rgba(255, 255, 255, 0.8)'
          }}>
            Выберите категорию
          </h2>
          <button
            onClick={onClose}
            style={{
              background: 'rgba(255, 255, 255, 0.1)',
              border: '1px solid rgba(255, 255, 255, 0.3)',
              borderRadius: '50%',
              width: '32px',
              height: '32px',
              color: '#fff',
              fontSize: '18px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.3s ease'
            }}
          >
            ✕
          </button>
        </div>

        {/* Категории в виде сот - 3 ряда */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          overflowX: 'hidden',
          padding: '10px 0'
        }}>
          <div style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '8px',
            marginLeft: '-4px'
          }}>
            {allOptions.map((category, index) => {
              const count = cityName && category !== 'Все категории' 
                ? getCount(stats, 'category', `${cityName}|${category}`)
                : 0;
              
              // Определяем позицию в сетке сот
              const row = index % 3; // 3 ряда
              const isEvenRow = row === 1; // средний ряд немного смещен
              const isSelected = (category === 'Все категории' && selectedCategory === null) || 
                                 (category === selectedCategory);
              
              return (
                <div
                  key={category}
                  style={{
                    position: 'relative',
                    marginLeft: isEvenRow ? '50px' : '0',
                    marginBottom: '-12px'
                  }}
                >
                  <button
                    onClick={() => {
                      onSelectCategory(category === 'Все категории' ? null : category);
                      onClose();
                    }}
                    style={{
                      position: 'relative',
                      width: '120px',
                      height: '70px',
                      background: isSelected 
                        ? 'rgba(255, 255, 255, 0.2)' 
                        : 'rgba(255, 255, 255, 0.08)',
                      backdropFilter: 'blur(10px)',
                      border: isSelected 
                        ? '2px solid rgba(255, 255, 255, 0.8)' 
                        : '1.5px solid rgba(255, 255, 255, 0.3)',
                      clipPath: 'polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%)',
                      color: '#fff',
                      fontSize: '12px',
                      fontWeight: isSelected ? '500' : '300',
                      cursor: 'pointer',
                      transition: 'all 0.3s ease',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '4px',
                      padding: '8px',
                      textAlign: 'center',
                      boxShadow: isSelected 
                        ? '0 0 20px rgba(255, 255, 255, 0.5)' 
                        : 'none'
                    }}
                    onMouseEnter={(e) => {
                      const target = e.currentTarget as HTMLButtonElement;
                      target.style.background = 'rgba(255, 255, 255, 0.2)';
                      target.style.borderColor = 'rgba(255, 255, 255, 0.6)';
                      target.style.transform = 'scale(1.08)';
                      target.style.boxShadow = '0 0 20px rgba(255, 255, 255, 0.4)';
                    }}
                    onMouseLeave={(e) => {
                      const target = e.currentTarget as HTMLButtonElement;
                      if (!isSelected) {
                        target.style.background = 'rgba(255, 255, 255, 0.08)';
                        target.style.borderColor = 'rgba(255, 255, 255, 0.3)';
                        target.style.boxShadow = 'none';
                      } else {
                        target.style.background = 'rgba(255, 255, 255, 0.2)';
                        target.style.borderColor = 'rgba(255, 255, 255, 0.8)';
                        target.style.boxShadow = '0 0 20px rgba(255, 255, 255, 0.5)';
                      }
                      target.style.transform = 'scale(1)';
                    }}
                  >
                    <span style={{
                      maxWidth: '100px',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                      lineHeight: '1.2'
                    }}>
                      {category === 'Все категории' ? 'ВСЕ' : category}
                    </span>
                    {count > 0 && <UserCounter count={count} />}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
