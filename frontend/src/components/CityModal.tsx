import { useActivity, getCount } from '../hooks/useActivity';
import { UserCounter } from './UserCounter';

interface City {
  name: string;
  coords: [number, number];
}

interface CityModalProps {
  cities: City[];
  onSelectCity: (city: City) => void;
  onClose: () => void;
}

export function CityModal({ cities, onSelectCity, onClose }: CityModalProps) {
  // Получаем статистику активных пользователей
  const { stats } = useActivity({ enabled: true });
  
  // Группируем города по первой букве
  const citiesByLetter = cities.reduce((acc, city) => {
    const firstLetter = city.name[0].toUpperCase();
    if (!acc[firstLetter]) {
      acc[firstLetter] = [];
    }
    acc[firstLetter].push(city);
    return acc;
  }, {} as Record<string, City[]>);

  // Получаем отсортированный список букв
  const letters = Object.keys(citiesByLetter).sort();

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
          maxWidth: '500px',
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
            Выберите город
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

        {/* Список городов в виде сот (3-5-3 паттерн) */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          overflowX: 'hidden',
          padding: '10px 0'
        }}>
          {letters.map(letter => (
            <div key={letter} style={{ marginBottom: '30px' }}>
              {/* Буква-заголовок */}
              <div style={{
                color: '#fff',
                fontSize: '20px',
                fontWeight: '600',
                marginBottom: '20px',
                textShadow: '0 0 10px rgba(255, 255, 255, 0.6)',
                borderBottom: '1px solid rgba(255, 255, 255, 0.3)',
                paddingBottom: '4px'
              }}>
                {letter}
              </div>
              
              {/* Соты в паттерне 3-5-3 */}
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '0'
              }}>
                {(() => {
                  const cities = citiesByLetter[letter];
                  const rows: any[][] = [];
                  let currentIndex = 0;
                  
                  // Распределяем города по рядам (3-5-3-5-3...)
                  while (currentIndex < cities.length) {
                    const rowIndex = rows.length;
                    const isMiddleRow = rowIndex % 2 === 1;
                    const rowSize = isMiddleRow ? 5 : 3;
                    rows.push(cities.slice(currentIndex, currentIndex + rowSize));
                    currentIndex += rowSize;
                  }
                  
                  return rows.map((row, rowIndex) => {
                    const isMiddleRow = rowIndex % 2 === 1;
                    
                    return (
                      <div
                        key={rowIndex}
                        style={{
                          display: 'flex',
                          gap: '6px',
                          marginBottom: '-18px',
                          marginLeft: isMiddleRow ? '0' : '68px'
                        }}
                      >
                        {row.map(city => {
                          const cityUserCount = getCount(stats, 'city', city.name);
                          
                          return (
                            <button
                              key={city.name}
                              onClick={() => {
                                onSelectCity(city);
                                onClose();
                              }}
                              style={{
                                position: 'relative',
                                width: '120px',
                                height: '70px',
                                background: 'rgba(255, 255, 255, 0.08)',
                                backdropFilter: 'blur(10px)',
                                border: '1.5px solid rgba(255, 255, 255, 0.3)',
                                clipPath: 'polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%)',
                                color: '#fff',
                                fontSize: '12px',
                                fontWeight: '300',
                                cursor: 'pointer',
                                transition: 'all 0.3s ease',
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '4px',
                                padding: '8px',
                                textAlign: 'center'
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
                                target.style.background = 'rgba(255, 255, 255, 0.08)';
                                target.style.borderColor = 'rgba(255, 255, 255, 0.3)';
                                target.style.transform = 'scale(1)';
                                target.style.boxShadow = 'none';
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
                              }}>{city.name}</span>
                              {cityUserCount > 0 && <UserCounter count={cityUserCount} />}
                            </button>
                          );
                        })}
                      </div>
                    );
                  });
                })()}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
