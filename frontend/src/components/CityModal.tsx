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

        {/* Список городов в виде сот */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          overflowX: 'hidden',
          padding: '10px 0'
        }}>
          {letters.map(letter => (
            <div key={letter} style={{ marginBottom: '25px' }}>
              {/* Буква-заголовок */}
              <div style={{
                color: '#fff',
                fontSize: '20px',
                fontWeight: '600',
                marginBottom: '15px',
                textShadow: '0 0 10px rgba(255, 255, 255, 0.6)',
                borderBottom: '1px solid rgba(255, 255, 255, 0.3)',
                paddingBottom: '4px'
              }}>
                {letter}
              </div>
              
              {/* Города в виде сот - 3 ряда */}
              <div style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: '8px',
                marginLeft: '-4px'
              }}>
                {citiesByLetter[letter].map((city, index) => {
                  const cityUserCount = getCount(stats, 'city', city.name);
                  // Определяем позицию в сетке сот
                  const row = index % 3; // 3 ряда
                  const isEvenRow = row === 1; // средний ряд немного смещен
                  
                  return (
                    <div
                      key={city.name}
                      style={{
                        position: 'relative',
                        marginLeft: isEvenRow ? '50px' : '0',
                        marginBottom: '-12px'
                      }}
                    >
                      <button
                        onClick={() => {
                          onSelectCity(city);
                          onClose();
                        }}
                        style={{
                          position: 'relative',
                          width: '110px',
                          height: '64px',
                          background: 'rgba(255, 255, 255, 0.08)',
                          backdropFilter: 'blur(10px)',
                          border: '1.5px solid rgba(255, 255, 255, 0.3)',
                          clipPath: 'polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%)',
                          color: '#fff',
                          fontSize: '13px',
                          fontWeight: '300',
                          cursor: 'pointer',
                          transition: 'all 0.3s ease',
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '4px',
                          padding: '8px',
                          textAlign: 'center',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap'
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
                          maxWidth: '90px',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap'
                        }}>{city.name}</span>
                        {cityUserCount > 0 && <UserCounter count={cityUserCount} />}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
